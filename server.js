// server.js - Unified Express Application Server (Advanced Upgrade)
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Express Session Management (In-memory storage)
app.use(session({
  name: 'lakon_session',
  secret: 'lakon_indigo_secret_key_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    secure: false, // Set to true if running over HTTPS
    httpOnly: true
  }
}));

// Uploads Folder Config
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB size limit
});


// --- MIDDLEWARE HELPERS ---

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Please login.' });
  }
  next();
};

// Verify if the user is owner or collaborator of the project
async function hasProjectAccess(projectId, userId, requireOwner = false) {
  try {
    const [project] = await db.query('SELECT user_id FROM projects WHERE id = ?', [projectId]);
    if (project.length === 0) return false;
    if (project[0].user_id === userId) return true; // Is Owner
    
    if (requireOwner) return false; // Action requires owner role

    // Check project collaborators
    const [member] = await db.query('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    return member.length > 0;
  } catch (err) {
    console.error('Project access check failed:', err);
    return false;
  }
}

// Log changes to project audit logs
async function logActivity(projectId, userId, action, details = '') {
  try {
    await db.query(
      'INSERT INTO audit_logs (project_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [projectId, userId, action, details]
    );
  } catch (err) {
    console.error('Activity logging failed:', err);
  }
}

// Cascading task scheduler: recursively shifts downstream successor tasks when predecessor finishes later
async function cascadeTaskSchedule(taskId, predecessorEndDate, userId) {
  try {
    // Find tasks that depend on taskId
    const [deps] = await db.query('SELECT task_id FROM dependencies WHERE predecessor_id = ?', [taskId]);
    
    for (const dep of deps) {
      const succId = dep.task_id;
      const [succTasks] = await db.query('SELECT start_date, end_date, name, project_id FROM tasks WHERE id = ?', [succId]);
      
      if (succTasks.length > 0) {
        const succ = succTasks[0];
        const succStart = new Date(succ.start_date);
        const predEnd = new Date(predecessorEndDate);
        
        // Successor must start at least 1 day after predecessor finish date
        const minStartDate = new Date(predEnd);
        minStartDate.setDate(minStartDate.getDate() + 1);
        
        if (succStart < minStartDate) {
          const durationDays = Math.ceil((new Date(succ.end_date) - succStart) / (1000 * 60 * 60 * 24));
          const newStartStr = minStartDate.toISOString().split('T')[0];
          
          const newEndDate = new Date(minStartDate);
          newEndDate.setDate(newEndDate.getDate() + durationDays);
          const newEndStr = newEndDate.toISOString().split('T')[0];
          
          await db.query('UPDATE tasks SET start_date = ?, end_date = ? WHERE id = ?', [newStartStr, newEndStr, succId]);
          
          // Log automated shifting
          await logActivity(
            succ.project_id,
            userId,
            'Auto Schedule Cascade',
            `Task "${succ.name}" start date automatically pushed to ${newStartStr} to resolve predecessor overlap.`
          );
          
          // Recursively cascade for successor's downstream dependents
          await cascadeTaskSchedule(succId, newEndStr, userId);
        }
      }
    }
  } catch (err) {
    console.error('Schedule cascading failed:', err);
  }
}


// --- STATIC FILES ROUTING ---

app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));


// --- API AUTHENTICATION ROUTING ---

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }
  if (username.trim().length < 3) {
    return res.status(400).json({ success: false, message: 'Username must be at least 3 characters.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username.trim(), hashedPassword]);

    res.json({ success: true, message: 'Registration successful. You can now log in.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()]);
    if (users.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password.' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;

    res.json({
      success: true,
      message: 'Login successful.',
      data: { username: user.username }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

app.get('/api/auth/status', (req, res) => {
  if (req.session.userId) {
    res.json({
      success: true,
      message: 'Authenticated.',
      data: { logged_in: true, username: req.session.username }
    });
  } else {
    res.json({
      success: true,
      message: 'Not authenticated.',
      data: { logged_in: false }
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Could not log out.' });
    }
    res.clearCookie('lakon_session');
    res.json({ success: true, message: 'Logged out successfully.' });
  });
});


// --- API PROJECTS ROUTING ---

// List all projects owned by user OR project where user is a collaborator
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    const query = `
      SELECT p.* FROM projects p
      LEFT JOIN project_members pm ON p.id = pm.project_id
      WHERE p.user_id = ? OR pm.user_id = ?
      GROUP BY p.id
      ORDER BY p.id DESC
    `;
    const [projects] = await db.query(query, [req.session.userId, req.session.userId]);
    res.json({ success: true, message: 'Projects retrieved.', data: projects });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Create project
app.post('/api/projects', requireAuth, async (req, res) => {
  const { name, description, start_date } = req.body;
  if (!name || !start_date) {
    return res.status(400).json({ success: false, message: 'Project name and start date are required.' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO projects (user_id, name, description, start_date) VALUES (?, ?, ?, ?)',
      [req.session.userId, name.trim(), description ? description.trim() : '', start_date]
    );
    const projectId = result.insertId;

    await logActivity(projectId, req.session.userId, 'Create Project', `Project "${name.trim()}" created.`);

    res.json({ success: true, message: 'Project created successfully.', data: { id: projectId } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Update project
app.put('/api/projects/:id', requireAuth, async (req, res) => {
  const projectId = req.params.id;
  const { name, description, start_date } = req.body;

  if (!name || !start_date) {
    return res.status(400).json({ success: false, message: 'Project name and start date are required.' });
  }

  const hasAccess = await hasProjectAccess(projectId, req.session.userId, true); // Owner only
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied or project not found.' });
  }

  try {
    await db.query(
      'UPDATE projects SET name = ?, description = ?, start_date = ? WHERE id = ?',
      [name.trim(), description ? description.trim() : '', start_date, projectId]
    );

    await logActivity(projectId, req.session.userId, 'Update Project', `Project details modified.`);

    res.json({ success: true, message: 'Project updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Delete project
app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  const projectId = req.params.id;

  const hasAccess = await hasProjectAccess(projectId, req.session.userId, true); // Owner only
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied or project not found.' });
  }

  try {
    await db.query('DELETE FROM projects WHERE id = ?', [projectId]);
    res.json({ success: true, message: 'Project deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- COLLABORATORS ROUTING ---

// Get list of project collaborators + project owner
app.get('/api/projects/:projectId/members', requireAuth, async (req, res) => {
  const projectId = req.params.projectId;

  const hasAccess = await hasProjectAccess(projectId, req.session.userId, false);
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const query = `
      SELECT u.id, u.username, 'owner' as role FROM users u
      JOIN projects p ON u.id = p.user_id
      WHERE p.id = ?
      UNION
      SELECT u.id, u.username, pm.role FROM users u
      JOIN project_members pm ON u.id = pm.user_id
      WHERE pm.project_id = ?
    `;
    const [members] = await db.query(query, [projectId, projectId]);
    res.json({ success: true, data: members });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Add collaborator to project (owner only)
app.post('/api/projects/:projectId/members', requireAuth, async (req, res) => {
  const projectId = req.params.projectId;
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const isOwner = await hasProjectAccess(projectId, req.session.userId, true);
  if (!isOwner) {
    return res.status(403).json({ success: false, message: 'Only project owners can invite collaborators.' });
  }

  try {
    const [users] = await db.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const inviteeId = users[0].id;

    // Check if owner is inviting themselves
    const [project] = await db.query('SELECT user_id FROM projects WHERE id = ?', [projectId]);
    if (project[0].user_id === inviteeId) {
      return res.status(400).json({ success: false, message: 'User is already the owner of the project.' });
    }

    await db.query('INSERT IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, inviteeId, 'member']);
    
    await logActivity(projectId, req.session.userId, 'Invite Member', `User "${username.trim()}" added as collaborator.`);

    res.json({ success: true, message: `User "${username.trim()}" successfully added to project.` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Remove collaborator (owner only)
app.delete('/api/projects/:projectId/members/:userId', requireAuth, async (req, res) => {
  const { projectId, userId } = req.params;

  const isOwner = await hasProjectAccess(projectId, req.session.userId, true);
  if (!isOwner) {
    return res.status(403).json({ success: false, message: 'Only project owners can manage members.' });
  }

  try {
    const [memberInfo] = await db.query('SELECT u.username FROM users u JOIN project_members pm ON u.id = pm.user_id WHERE pm.project_id = ? AND pm.user_id = ?', [projectId, userId]);
    const memberName = memberInfo.length > 0 ? memberInfo[0].username : 'Unknown';

    await db.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    
    await logActivity(projectId, req.session.userId, 'Remove Member', `Collaborator "${memberName}" removed.`);

    res.json({ success: true, message: 'Collaborator removed from project.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- API TASKS ROUTING ---

// Fetch tasks + dependencies
app.get('/api/projects/:projectId/tasks', requireAuth, async (req, res) => {
  const projectId = req.params.projectId;

  const hasAccess = await hasProjectAccess(projectId, req.session.userId, false);
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const [tasks] = await db.query('SELECT * FROM tasks WHERE project_id = ? ORDER BY start_date ASC, id ASC', [projectId]);
    
    let dependencies = [];
    if (tasks.length > 0) {
      const taskIds = tasks.map(t => t.id);
      const [deps] = await db.query(
        `SELECT * FROM dependencies WHERE task_id IN (${taskIds.join(',')}) OR predecessor_id IN (${taskIds.join(',')})`
      );
      dependencies = deps;
    }

    res.json({
      success: true,
      message: 'Tasks retrieved.',
      data: { tasks, dependencies }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Create task
app.post('/api/tasks', requireAuth, async (req, res) => {
  const { project_id, name, start_date, end_date, progress, color, assignee_id, parent_id, type } = req.body;

  if (!project_id || !name || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: 'Project ID, task name, start date, and end date are required.' });
  }

  const hasAccess = await hasProjectAccess(project_id, req.session.userId, false);
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    let verifiedParentId = null;
    if (parent_id) {
      const [parentCheck] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parent_id, project_id]);
      if (parentCheck.length > 0) verifiedParentId = parseInt(parent_id);
    }

    let verifiedAssigneeId = null;
    if (assignee_id) {
      // Validate assignee belongs to the project members or owner
      const [assigneeCheck] = await db.query(`
        SELECT u.id FROM users u
        LEFT JOIN project_members pm ON u.id = pm.user_id
        LEFT JOIN projects p ON u.id = p.user_id
        WHERE u.id = ? AND (pm.project_id = ? OR p.id = ?)
      `, [assignee_id, project_id, project_id]);
      if (assigneeCheck.length > 0) verifiedAssigneeId = parseInt(assignee_id);
    }

    const taskType = type === 'milestone' ? 'milestone' : 'task';
    const finalEndDate = taskType === 'milestone' ? start_date : end_date; // Milestones have 0 duration, start === end

    const [result] = await db.query(
      `INSERT INTO tasks (project_id, name, start_date, end_date, progress, color, assignee_id, parent_id, type) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        name.trim(),
        start_date,
        finalEndDate,
        progress ? parseInt(progress) : 0,
        color || '#3b82f6',
        verifiedAssigneeId,
        verifiedParentId,
        taskType
      ]
    );
    const taskId = result.insertId;

    await logActivity(project_id, req.session.userId, 'Create Task', `Task "${name.trim()}" (${taskType}) added.`);

    res.json({ success: true, message: 'Task created successfully.', data: { id: taskId } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Recursive check for circular hierarchy
async function isDescendantTask(possibleParentId, taskId) {
  if (!possibleParentId) return false;
  const [rows] = await db.query('SELECT parent_id FROM tasks WHERE id = ?', [possibleParentId]);
  if (rows.length === 0) return false;
  const parentId = rows[0].parent_id;
  if (parentId == taskId) return true;
  return isDescendantTask(parentId, taskId);
}

// Update task
app.put('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = req.params.id;
  const { name, start_date, end_date, progress, color, assignee_id, parent_id, type } = req.body;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ success: false, message: 'Task name, start date, and end date are required.' });
  }

  try {
    const [taskInfo] = await db.query(
      `SELECT t.id, t.project_id, t.name, t.start_date, t.end_date FROM tasks t 
       JOIN projects p ON t.project_id = p.id 
       WHERE t.id = ? AND p.user_id = ? OR t.id = ? AND t.project_id IN (
         SELECT project_id FROM project_members WHERE user_id = ?
       )`,
      [taskId, req.session.userId, taskId, req.session.userId]
    );

    if (taskInfo.length === 0) {
      return res.status(403).json({ success: false, message: 'Task not found or access denied.' });
    }
    const projectId = taskInfo[0].project_id;
    const oldTaskName = taskInfo[0].name;
    const oldStartDate = taskInfo[0].start_date;
    const oldEndDate = taskInfo[0].end_date;

    let verifiedParentId = null;
    if (parent_id) {
      const parsedParentId = parseInt(parent_id);
      if (parsedParentId === parseInt(taskId)) {
        return res.status(400).json({ success: false, message: 'A task cannot be its own parent.' });
      }
      const [parentCheck] = await db.query('SELECT id FROM tasks WHERE id = ? AND project_id = ?', [parsedParentId, projectId]);
      if (parentCheck.length === 0) {
        return res.status(400).json({ success: false, message: 'Invalid parent task.' });
      }
      const isCircular = await isDescendantTask(parsedParentId, taskId);
      if (isCircular) {
        return res.status(400).json({ success: false, message: 'Circular hierarchy detected.' });
      }
      verifiedParentId = parsedParentId;
    }

    let verifiedAssigneeId = null;
    if (assignee_id) {
      const [assigneeCheck] = await db.query(`
        SELECT u.id FROM users u
        LEFT JOIN project_members pm ON u.id = pm.user_id
        LEFT JOIN projects p ON u.id = p.user_id
        WHERE u.id = ? AND (pm.project_id = ? OR p.id = ?)
      `, [assignee_id, projectId, projectId]);
      if (assigneeCheck.length > 0) verifiedAssigneeId = parseInt(assignee_id);
    }

    const taskType = type === 'milestone' ? 'milestone' : 'task';
    const finalEndDate = taskType === 'milestone' ? start_date : end_date;

    await db.query(
      `UPDATE tasks SET name = ?, start_date = ?, end_date = ?, progress = ?, color = ?, assignee_id = ?, parent_id = ?, type = ? 
       WHERE id = ?`,
      [
        name.trim(),
        start_date,
        finalEndDate,
        progress ? parseInt(progress) : 0,
        color || '#3b82f6',
        verifiedAssigneeId,
        verifiedParentId,
        taskType,
        taskId
      ]
    );

    // Activity logging
    let details = `Task details updated.`;
    if (oldStartDate !== start_date || oldEndDate !== finalEndDate) {
      details = `Schedule shifted from [${oldStartDate} to ${oldEndDate}] to [${start_date} to ${finalEndDate}].`;
    }
    await logActivity(projectId, req.session.userId, 'Update Task', `Task "${name.trim()}" updated: ${details}`);

    // If dates changed, trigger cascading auto-scheduling to successor tasks
    if (oldEndDate !== finalEndDate) {
      await cascadeTaskSchedule(taskId, finalEndDate, req.session.userId);
    }

    res.json({ success: true, message: 'Task updated successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
  const taskId = req.params.id;

  try {
    const [ownership] = await db.query(
      `SELECT t.id, t.project_id, t.name FROM tasks t 
       JOIN projects p ON t.project_id = p.id 
       WHERE t.id = ? AND p.user_id = ? OR t.id = ? AND t.project_id IN (
         SELECT project_id FROM project_members WHERE user_id = ?
       )`,
      [taskId, req.session.userId, taskId, req.session.userId]
    );
    if (ownership.length === 0) {
      return res.status(403).json({ success: false, message: 'Task not found or access denied.' });
    }
    const { project_id, name } = ownership[0];

    await db.query('DELETE FROM tasks WHERE id = ?', [taskId]);

    await logActivity(project_id, req.session.userId, 'Delete Task', `Task "${name}" removed.`);

    res.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- TASK BASELINE ROUTE ---

// Freeze baseline dates for all tasks in project
app.post('/api/projects/:projectId/baseline', requireAuth, async (req, res) => {
  const projectId = req.params.projectId;

  const hasAccess = await hasProjectAccess(projectId, req.session.userId, false);
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    await db.query(
      `UPDATE tasks SET baseline_start_date = start_date, baseline_end_date = end_date 
       WHERE project_id = ?`,
      [projectId]
    );

    await logActivity(projectId, req.session.userId, 'Set Baseline', 'Project schedules frozen as baseline.');

    res.json({ success: true, message: 'Baseline dates successfully saved for all project tasks.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- API DEPENDENCIES ROUTING ---

// Helper check for sirkular dependency loop
async function hasDependencyPath(startId, targetId, visited = new Set()) {
  if (startId === targetId) return true;
  if (visited.has(startId)) return false;
  visited.add(startId);

  const [rows] = await db.query('SELECT predecessor_id FROM dependencies WHERE task_id = ?', [startId]);
  for (const row of rows) {
    if (await hasDependencyPath(row.predecessor_id, targetId, visited)) {
      return true;
    }
  }
  return false;
}

// Create dependency
app.post('/api/dependencies', requireAuth, async (req, res) => {
  const { task_id, predecessor_id } = req.body;

  if (!task_id || !predecessor_id) {
    return res.status(400).json({ success: false, message: 'Task ID and Predecessor ID are required.' });
  }
  if (parseInt(task_id) === parseInt(predecessor_id)) {
    return res.status(400).json({ success: false, message: 'A task cannot depend on itself.' });
  }

  try {
    const [tasks] = await db.query(
      `SELECT t.id, t.project_id, t.name FROM tasks t 
       JOIN projects p ON t.project_id = p.id 
       WHERE t.id IN (?, ?) AND p.user_id = ? OR t.id IN (?, ?) AND t.project_id IN (
         SELECT project_id FROM project_members WHERE user_id = ?
       )`,
      [task_id, predecessor_id, req.session.userId, task_id, predecessor_id, req.session.userId]
    );

    if (tasks.length < 2) {
      return res.status(403).json({ success: false, message: 'Tasks not found or access denied.' });
    }
    const projectId = tasks[0].project_id;

    const isLoop = await hasDependencyPath(predecessor_id, task_id);
    if (isLoop) {
      return res.status(400).json({ success: false, message: 'Circular dependency detected.' });
    }

    await db.query('INSERT IGNORE INTO dependencies (task_id, predecessor_id) VALUES (?, ?)', [task_id, predecessor_id]);

    // Fetch names to create clear log details
    const [names] = await db.query('SELECT id, name FROM tasks WHERE id IN (?, ?)', [task_id, predecessor_id]);
    const predName = names.find(n => n.id == predecessor_id)?.name || 'Unknown';
    const succName = names.find(n => n.id == task_id)?.name || 'Unknown';

    await logActivity(projectId, req.session.userId, 'Add Dependency', `Created link: "${predName}" ➔ "${succName}".`);

    res.json({ success: true, message: 'Dependency created successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Delete dependency
app.delete('/api/dependencies', requireAuth, async (req, res) => {
  const { task_id, predecessor_id } = req.body;

  if (!task_id || !predecessor_id) {
    return res.status(400).json({ success: false, message: 'Task ID and Predecessor ID are required.' });
  }

  try {
    const [ownership] = await db.query(
      `SELECT t.id, t.project_id FROM tasks t 
       JOIN projects p ON t.project_id = p.id 
       WHERE t.id = ? AND p.user_id = ? OR t.id = ? AND t.project_id IN (
         SELECT project_id FROM project_members WHERE user_id = ?
       )`,
      [task_id, req.session.userId, task_id, req.session.userId]
    );

    if (ownership.length === 0) {
      return res.status(403).json({ success: false, message: 'Task not found or access denied.' });
    }
    const projectId = ownership[0].project_id;

    await db.query('DELETE FROM dependencies WHERE task_id = ? AND predecessor_id = ?', [task_id, predecessor_id]);

    await logActivity(projectId, req.session.userId, 'Remove Dependency', `Deleted link between task IDs ${predecessor_id} and ${task_id}.`);

    res.json({ success: true, message: 'Dependency removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- COMMENTS ROUTING ---

// Fetch comments of a task
app.get('/api/tasks/:taskId/comments', requireAuth, async (req, res) => {
  const taskId = req.params.taskId;

  try {
    // Validate project access
    const [task] = await db.query('SELECT project_id FROM tasks WHERE id = ?', [taskId]);
    if (task.length === 0) return res.status(404).json({ success: false, message: 'Task not found.' });
    
    const hasAccess = await hasProjectAccess(task[0].project_id, req.session.userId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied.' });

    const [comments] = await db.query(
      `SELECT c.id, c.content, c.created_at, u.username FROM comments c
       JOIN users u ON c.user_id = u.id
       WHERE c.task_id = ?
       ORDER BY c.id ASC`,
      [taskId]
    );
    res.json({ success: true, data: comments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Post comment to task
app.post('/api/tasks/:taskId/comments', requireAuth, async (req, res) => {
  const taskId = req.params.taskId;
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ success: false, message: 'Comment content cannot be empty.' });
  }

  try {
    const [task] = await db.query('SELECT project_id, name FROM tasks WHERE id = ?', [taskId]);
    if (task.length === 0) return res.status(404).json({ success: false, message: 'Task not found.' });
    
    const hasAccess = await hasProjectAccess(task[0].project_id, req.session.userId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied.' });

    await db.query(
      'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [taskId, req.session.userId, content.trim()]
    );

    await logActivity(task[0].project_id, req.session.userId, 'Add Comment', `Commented on task "${task[0].name}": "${content.trim().substring(0, 50)}..."`);

    res.json({ success: true, message: 'Comment posted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- ATTACHMENTS ROUTING ---

// Fetch attachments list for a task
app.get('/api/tasks/:taskId/attachments', requireAuth, async (req, res) => {
  const taskId = req.params.taskId;

  try {
    const [task] = await db.query('SELECT project_id FROM tasks WHERE id = ?', [taskId]);
    if (task.length === 0) return res.status(404).json({ success: false, message: 'Task not found.' });
    
    const hasAccess = await hasProjectAccess(task[0].project_id, req.session.userId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied.' });

    const [attachments] = await db.query(
      `SELECT a.id, a.filename, a.filesize, a.created_at, u.username FROM attachments a
       JOIN users u ON a.user_id = u.id
       WHERE a.task_id = ?`,
      [taskId]
    );
    res.json({ success: true, data: attachments });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Upload attachment to a task
app.post('/api/tasks/:taskId/attachments', requireAuth, upload.single('file'), async (req, res) => {
  const taskId = req.params.taskId;
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  try {
    const [task] = await db.query('SELECT project_id, name FROM tasks WHERE id = ?', [taskId]);
    if (task.length === 0) return res.status(404).json({ success: false, message: 'Task not found.' });
    
    const hasAccess = await hasProjectAccess(task[0].project_id, req.session.userId);
    if (!hasAccess) {
      // Clean up uploaded file since permission check failed
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    await db.query(
      'INSERT INTO attachments (task_id, user_id, filename, filepath, filesize) VALUES (?, ?, ?, ?, ?)',
      [taskId, req.session.userId, req.file.originalname, req.file.filename, req.file.size]
    );

    await logActivity(task[0].project_id, req.session.userId, 'Upload File', `File "${req.file.originalname}" uploaded to task "${task[0].name}".`);

    res.json({ success: true, message: 'File uploaded successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Download attachment file
app.get('/api/attachments/:id/download', requireAuth, async (req, res) => {
  const attachmentId = req.params.id;

  try {
    const [attachments] = await db.query(
      `SELECT a.*, t.project_id FROM attachments a
       JOIN tasks t ON a.task_id = t.id
       WHERE a.id = ?`,
      [attachmentId]
    );
    if (attachments.length === 0) return res.status(404).json({ success: false, message: 'Attachment not found.' });
    
    const attachment = attachments[0];
    const hasAccess = await hasProjectAccess(attachment.project_id, req.session.userId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied.' });

    const fullFilePath = path.join(uploadDir, attachment.filepath);
    if (!fs.existsSync(fullFilePath)) {
      return res.status(404).json({ success: false, message: 'File no longer exists on server disk.' });
    }

    res.download(fullFilePath, attachment.filename);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});

// Delete attachment
app.delete('/api/attachments/:id', requireAuth, async (req, res) => {
  const attachmentId = req.params.id;

  try {
    const [attachments] = await db.query(
      `SELECT a.*, t.project_id, t.name as task_name FROM attachments a
       JOIN tasks t ON a.task_id = t.id
       WHERE a.id = ?`,
      [attachmentId]
    );
    if (attachments.length === 0) return res.status(404).json({ success: false, message: 'Attachment not found.' });
    
    const attachment = attachments[0];
    const hasAccess = await hasProjectAccess(attachment.project_id, req.session.userId);
    if (!hasAccess) return res.status(403).json({ success: false, message: 'Access denied.' });

    const fullFilePath = path.join(uploadDir, attachment.filepath);
    if (fs.existsSync(fullFilePath)) {
      fs.unlinkSync(fullFilePath);
    }

    await db.query('DELETE FROM attachments WHERE id = ?', [attachmentId]);

    await logActivity(attachment.project_id, req.session.userId, 'Delete File', `Attachment "${attachment.filename}" removed from task "${attachment.task_name}".`);

    res.json({ success: true, message: 'Attachment successfully deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- AUDIT LOGS ROUTING ---

// Fetch audit activity logs for project
app.get('/api/projects/:projectId/logs', requireAuth, async (req, res) => {
  const projectId = req.params.projectId;

  const hasAccess = await hasProjectAccess(projectId, req.session.userId);
  if (!hasAccess) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }

  try {
    const [logs] = await db.query(
      `SELECT al.*, u.username FROM audit_logs al
       JOIN users u ON al.user_id = u.id
       WHERE al.project_id = ?
       ORDER BY al.id DESC LIMIT 150`,
      [projectId]
    );
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database error: ' + err.message });
  }
});


// --- EXPORT SPREADSHEET ROUTING ---

// Export project workplan as CSV file
app.get('/api/projects/:projectId/export/csv', requireAuth, async (req, res) => {
  const projectId = req.params.projectId;

  const hasAccess = await hasProjectAccess(projectId, req.session.userId);
  if (!hasAccess) {
    return res.status(403).send('Access denied.');
  }

  try {
    const [project] = await db.query('SELECT name FROM projects WHERE id = ?', [projectId]);
    const projectName = project[0].name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    // Fetch tasks including assignee names and parent task details
    const query = `
      SELECT t.id, t.name, t.type, t.start_date, t.end_date, t.progress, t.color, 
             u.username as assignee, p.name as parent_name
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN tasks p ON t.parent_id = p.id
      WHERE t.project_id = ?
      ORDER BY t.start_date ASC, t.id ASC
    `;
    const [tasks] = await db.query(query, [projectId]);

    // Build CSV Content
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    csvContent += 'Task ID,Task Name,Type,Start Date,End Date,Progress (%),Assignee,Parent Task\n';

    tasks.forEach(t => {
      const escape = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
      };

      csvContent += `${t.id},${escape(t.name)},${t.type},${t.start_date.toISOString().split('T')[0]},${t.end_date.toISOString().split('T')[0]},${t.progress},${escape(t.assignee)},${escape(t.parent_name)}\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lakon_${projectName}_workplan.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).send('Database error during export: ' + err.message);
  }
});

// App listener
app.listen(PORT, () => {
  console.log(`LAKON Express app listening on port http://localhost:${PORT}`);
});
