/* app.js - State Management & UI Orchestration (Advanced Upgrade) */

// Application State
const state = {
  projects: [],
  activeProjectId: null,
  tasks: [],
  dependencies: [],
  members: [], // Project members list
  activeTaskIdForModal: null, // Track currently loaded task in modal
  zoomLevel: 'day',
  searchQuery: '',
  showCriticalPath: false,
  collapsedTaskIds: new Set(),
  currentUser: null
};

// Colors for the project tasks
const TASK_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupTheme();
  const authed = await checkAuthStatus();
  if (authed) {
    initApp();
  } else {
    window.location.href = 'login.html';
  }
});

// Setup Dark/Light Theme
function setupTheme() {
  const themeToggle = document.getElementById('theme-toggle-btn');
  if (!themeToggle) return;
  
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }

  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
    if (typeof drawDependencyLines === 'function') {
      drawDependencyLines();
    }
  });
  
  updateThemeIcon(savedTheme === 'dark');
}

function updateThemeIcon(isDark) {
  const icon = document.querySelector('#theme-toggle-btn svg path');
  if (!icon) return;
  if (isDark) {
    icon.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z');
  } else {
    icon.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
  }
}

// Check Authentication Status
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/status');
    const result = await response.json();
    if (result.success && result.data.logged_in) {
      state.currentUser = result.data.username;
      
      const avatar = document.getElementById('user-avatar');
      const name = document.getElementById('user-name');
      if (avatar) avatar.textContent = state.currentUser.substring(0, 2).toUpperCase();
      if (name) name.textContent = state.currentUser;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

// Initialise App Features
async function initApp() {
  await fetchProjects();
  setupEventListeners();
  
  if (state.projects.length > 0) {
    selectProject(state.projects[0].id);
  } else {
    renderEmptyState();
  }
}

// Set up UI Event Listeners
function setupEventListeners() {
  // Add Project
  const addProjBtn = document.getElementById('btn-add-project');
  if (addProjBtn) addProjBtn.onclick = () => openProjectModal();

  // Add Task
  const addTaskBtn = document.getElementById('btn-add-task');
  if (addTaskBtn) addTaskBtn.onclick = () => openTaskModal();

  // Project Members collaborators modal trigger
  const membersBtn = document.getElementById('btn-project-members');
  if (membersBtn) membersBtn.onclick = () => openMembersModal();

  // Baseline schedule trigger
  const baselineBtn = document.getElementById('btn-project-baseline');
  if (baselineBtn) baselineBtn.onclick = () => triggerProjectBaseline();

  // Audit Logs drawer trigger
  const logsBtn = document.getElementById('btn-project-logs');
  if (logsBtn) logsBtn.onclick = () => openLogsModal();

  // CSV Exporter
  const exportBtn = document.getElementById('btn-export-csv');
  if (exportBtn) exportBtn.onclick = () => exportProjectCSV();

  // Print button
  const printBtn = document.getElementById('btn-print-report');
  if (printBtn) {
    printBtn.onclick = async () => {
      await preparePrintReport();
      window.print();
    };
  }

  // Search input
  const searchInput = document.getElementById('task-search');
  if (searchInput) {
    searchInput.oninput = (e) => {
      state.searchQuery = e.target.value.toLowerCase();
      renderTasks();
    };
  }

  // Critical Path Toggle
  const criticalToggle = document.getElementById('btn-critical-path');
  if (criticalToggle) {
    criticalToggle.onclick = () => {
      state.showCriticalPath = !state.showCriticalPath;
      criticalToggle.classList.toggle('active', state.showCriticalPath);
      renderTasks();
    };
  }

  // Zoom toggles
  const zoomBtns = document.querySelectorAll('.zoom-btn');
  zoomBtns.forEach(btn => {
    btn.onclick = (e) => {
      zoomBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      state.zoomLevel = e.target.dataset.zoom;
      renderTasks();
    };
  });

  // Modal forms
  document.getElementById('form-project').onsubmit = handleProjectSubmit;
  document.getElementById('form-task').onsubmit = handleTaskSubmit;

  // Sync scroll
  const tableBody = document.getElementById('task-table-body');
  const chartPanel = document.getElementById('gantt-chart-panel');
  
  if (tableBody && chartPanel) {
    tableBody.onscroll = () => {
      chartPanel.scrollTop = tableBody.scrollTop;
    };
    chartPanel.onscroll = () => {
      tableBody.scrollTop = chartPanel.scrollTop;
      if (typeof drawDependencyLines === 'function') {
        drawDependencyLines();
      }
    };
  }

  // Task Modal Tab switching
  const modalTabs = document.querySelectorAll('#task-modal-tabs .modal-tab');
  modalTabs.forEach(tab => {
    tab.onclick = (e) => {
      modalTabs.forEach(t => t.classList.remove('active'));
      e.target.classList.add('active');
      
      const targetId = e.target.dataset.target;
      document.querySelectorAll('.task-tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(targetId).classList.remove('hidden');
    };
  });

  // Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.onclick = async () => {
      if (confirm('Log out of PlanFlow?')) {
        try {
          const response = await fetch('/api/auth/logout', { method: 'POST' });
          const result = await response.json();
          if (result.success) {
            window.location.href = 'login.html';
          }
        } catch (error) {
          console.error('Logout error:', error);
        }
      }
    };
  }
}

// Render Empty State
function renderEmptyState() {
  const details = document.getElementById('active-project-details');
  const stats = document.getElementById('analytics-container');
  const options = document.getElementById('options-container');
  const workspace = document.getElementById('gantt-workspace');
  const workload = document.getElementById('workload-panel');
  const actionMembers = document.getElementById('btn-project-members');
  const actionBaseline = document.getElementById('btn-project-baseline');
  const actionLogs = document.getElementById('btn-project-logs');
  const actionExport = document.getElementById('btn-export-csv');
  const actionPrint = document.getElementById('btn-print-report');

  if (details) details.innerHTML = '<h2>Select or Create a Project</h2><p>Use the sidebar to pick your workspace.</p>';
  if (stats) stats.classList.add('hidden');
  if (options) options.classList.add('hidden');
  if (workload) workload.classList.add('hidden');
  
  if (actionMembers) actionMembers.classList.add('hidden');
  if (actionBaseline) actionBaseline.classList.add('hidden');
  if (actionLogs) actionLogs.classList.add('hidden');
  if (actionExport) actionExport.classList.add('hidden');
  if (actionPrint) actionPrint.classList.add('hidden');
  
  if (workspace) {
    workspace.innerHTML = `
      <div class="empty-state">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3>No Projects Yet</h3>
        <p>Create your first project to start planning tasks and visualizing Gantt timelines.</p>
        <button class="btn btn-primary" onclick="openProjectModal()">Create Project</button>
      </div>
    `;
  }
}

// Fetch Projects list from DB
async function fetchProjects() {
  try {
    const response = await fetch('/api/projects');
    const result = await response.json();
    if (result.success) {
      state.projects = result.data;
      renderProjectList();
    }
  } catch (error) {
    console.error('Error fetching projects:', error);
  }
}

// Render Project list in Sidebar
function renderProjectList() {
  const container = document.getElementById('project-list-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  state.projects.forEach(project => {
    const li = document.createElement('li');
    const isActive = project.id == state.activeProjectId;
    
    li.innerHTML = `
      <button class="project-item-btn ${isActive ? 'active' : ''}" onclick="selectProject(${project.id})">
        <span class="project-name-text" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
        <span class="project-actions">
          <span class="project-action-btn edit-btn" onclick="event.stopPropagation(); openProjectModal(${project.id})">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </span>
          <span class="project-action-btn" onclick="event.stopPropagation(); deleteProject(${project.id})">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </span>
        </span>
      </button>
    `;
    container.appendChild(li);
  });
}

// Select Active Project
async function selectProject(projectId) {
  state.activeProjectId = projectId;
  renderProjectList();
  
  const project = state.projects.find(p => p.id == projectId);
  if (!project) return;
  
  document.getElementById('analytics-container').classList.remove('hidden');
  document.getElementById('options-container').classList.remove('hidden');
  document.getElementById('workload-panel').classList.remove('hidden');
  
  // Show action buttons
  document.getElementById('btn-project-members').classList.remove('hidden');
  document.getElementById('btn-project-baseline').classList.remove('hidden');
  document.getElementById('btn-project-logs').classList.remove('hidden');
  document.getElementById('btn-export-csv').classList.remove('hidden');
  document.getElementById('btn-print-report').classList.remove('hidden');
  
  // Update Project Header Details
  const details = document.getElementById('active-project-details');
  if (details) {
    details.innerHTML = `
      <h2>${escapeHtml(project.name)}</h2>
      <p>${escapeHtml(project.description || 'No project description.')}</p>
      <div class="project-meta">
        <div class="meta-item">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>Starts: <strong>${formatDateFriendly(project.start_date)}</strong></span>
        </div>
      </div>
    `;
  }
  
  // Fetch members to populate assignees and workload
  await fetchProjectMembers(projectId);
  await fetchTasks(projectId);
}

// Fetch Project Members collaborators
async function fetchProjectMembers(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}/members`);
    const result = await response.json();
    if (result.success) {
      state.members = result.data;
    }
  } catch (error) {
    console.error('Error fetching project members:', error);
  }
}

// Fetch Tasks for Active Project
async function fetchTasks(projectId) {
  try {
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    const result = await response.json();
    if (result.success) {
      state.tasks = result.data.tasks;
      state.dependencies = result.data.dependencies;
      renderTasks();
    }
  } catch (error) {
    console.error('Error fetching tasks:', error);
  }
}

// Render Tasks both in Table Tree Grid and Gantt chart
function renderTasks() {
  const workspace = document.getElementById('gantt-workspace');
  if (!workspace || state.tasks.length === 0) {
    if (state.activeProjectId) {
      workspace.innerHTML = `
        <div class="empty-state">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          <h3>This project has no tasks</h3>
          <p>Get started by creating a task. You can drag and schedule it on the timeline.</p>
          <button class="btn btn-primary" onclick="openTaskModal()">Add Task</button>
        </div>
      `;
      updateAnalytics();
      calculateAndRenderWorkload();
    }
    return;
  }
  
  workspace.innerHTML = `
    <!-- Left Panel: Task Table Grid -->
    <div class="gantt-table-panel">
      <div class="table-panel-header">
        <div class="tbl-col-name">Task Name</div>
        <div class="tbl-col-duration">Days</div>
        <div class="tbl-col-assignee">Assignee</div>
        <div class="tbl-col-actions"></div>
      </div>
      <div class="table-panel-body" id="task-table-body"></div>
    </div>
    
    <!-- Right Panel: Gantt Chart Scrollable Panel -->
    <div class="gantt-chart-panel" id="gantt-chart-panel">
      <div class="chart-viewport" id="gantt-chart-viewport">
        <div class="chart-header" id="gantt-chart-header"></div>
        
        <div class="chart-grid-body" id="gantt-chart-body">
          <div class="chart-grid-cols" id="gantt-grid-cols"></div>
          <div class="chart-rows-container" id="gantt-rows-container"></div>
          <svg class="gantt-svg-overlay" id="gantt-svg-overlay">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--text-muted)"/>
              </marker>
              <marker id="arrow-critical" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="var(--danger)"/>
              </marker>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  `;

  const taskTree = buildTaskHierarchy(state.tasks);
  
  let filteredTree = taskTree;
  if (state.searchQuery) {
    filteredTree = filterTaskTree(taskTree, state.searchQuery);
  }

  if (state.showCriticalPath) {
    calculateCriticalPath();
  } else {
    state.tasks.forEach(t => t.isCritical = false);
  }

  const tableBody = document.getElementById('task-table-body');
  const rowsContainer = document.getElementById('gantt-rows-container');
  
  tableBody.innerHTML = '';
  rowsContainer.innerHTML = '';
  
  function renderNode(node, depth = 0) {
    const task = node.task;
    const isParent = node.children.length > 0;
    const isCollapsed = state.collapsedTaskIds.has(task.id);
    const isMilestone = task.type === 'milestone';
    
    let durationDays = 0;
    if (isMilestone) {
      durationDays = 0;
    } else {
      const durMs = new Date(task.end_date) - new Date(task.start_date);
      durationDays = Math.ceil(durMs / (1000 * 60 * 60 * 24)) + 1;
    }
    
    const rowEl = document.createElement('div');
    rowEl.className = `gantt-row ${isParent ? 'parent-row' : ''} ${task.parent_id ? 'subtask-row' : ''}`;
    rowEl.dataset.taskId = task.id;
    
    const indentPadding = depth * 20;
    
    // Find assignee name from members
    const member = state.members.find(m => m.id == task.assignee_id);
    const assigneeName = member ? member.username : '';
    
    rowEl.innerHTML = `
      <div class="tbl-cell-name" style="padding-left: ${indentPadding + 8}px">
        ${isParent ? `
          <button class="toggle-subtasks ${isCollapsed ? 'collapsed' : ''}" onclick="toggleSubtasks(${task.id})">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        ` : `<span style="width: 18px; display:inline-block"></span>`}
        <span class="task-name-span" onclick="openTaskModal(${task.id})" title="Click to edit task">${isMilestone ? '◆ ' : ''}${escapeHtml(task.name)}</span>
      </div>
      <div class="tbl-cell-duration">${isMilestone ? 'M' : durationDays + 'd'}</div>
      <div class="tbl-cell-assignee">
        ${assigneeName ? `<span class="assignee-badge">${escapeHtml(assigneeName)}</span>` : '<span class="text-muted" style="font-size:0.75em">—</span>'}
      </div>
      <div class="tbl-cell-actions">
        <button class="tbl-action-btn" onclick="openTaskModal(null, ${task.id})" title="Add subtask">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
        <button class="tbl-action-btn del" onclick="deleteTask(${task.id})" title="Delete task">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;
    tableBody.appendChild(rowEl);
    
    const chartRowEl = document.createElement('div');
    chartRowEl.className = `chart-row gantt-row-placeholder-${task.id}`;
    chartRowEl.dataset.taskId = task.id;
    rowsContainer.appendChild(chartRowEl);
    
    if (!isCollapsed && node.children.length > 0) {
      node.children.forEach(childNode => renderNode(childNode, depth + 1));
    }
  }
  
  filteredTree.forEach(node => renderNode(node, 0));
  
  setupEventListeners();

  if (typeof initGanttChart === 'function') {
    initGanttChart();
  }

  updateAnalytics();
  calculateAndRenderWorkload();
}

// Build hierarchy tree
function buildTaskHierarchy(tasks) {
  const map = {};
  const roots = [];
  
  tasks.forEach(task => {
    map[task.id] = { task: task, children: [] };
  });
  
  tasks.forEach(task => {
    const parentId = task.parent_id;
    if (parentId && map[parentId]) {
      map[parentId].children.push(map[task.id]);
    } else {
      roots.push(map[task.id]);
    }
  });
  
  return roots;
}

// Filter Hierarchy Tree
function filterTaskTree(nodes, query) {
  const result = [];
  
  nodes.forEach(node => {
    // Check assignee name
    const member = state.members.find(m => m.id == node.task.assignee_id);
    const assName = member ? member.username.toLowerCase() : '';
    
    const matches = node.task.name.toLowerCase().includes(query) || assName.includes(query);
    const filteredChildren = filterTaskTree(node.children, query);
    
    if (matches || filteredChildren.length > 0) {
      result.push({
        task: node.task,
        children: filteredChildren
      });
    }
  });
  
  return result;
}

// Expand / Collapse Subtasks toggle
function toggleSubtasks(taskId) {
  if (state.collapsedTaskIds.has(taskId)) {
    state.collapsedTaskIds.delete(taskId);
  } else {
    state.collapsedTaskIds.add(taskId);
  }
  renderTasks();
}

// Calculate Dashboard Stats Row
function updateAnalytics() {
  const totalTasksVal = document.getElementById('val-total-tasks');
  const compTasksVal = document.getElementById('val-completed-tasks');
  const progressVal = document.getElementById('val-avg-progress');
  const criticalVal = document.getElementById('val-critical-warning');
  
  if (!totalTasksVal || state.tasks.length === 0) {
    if (totalTasksVal) totalTasksVal.textContent = '0';
    if (compTasksVal) compTasksVal.textContent = '0';
    if (progressVal) progressVal.textContent = '0%';
    if (criticalVal) {
      criticalVal.textContent = '0';
      criticalVal.closest('.stat-card').style.border = 'none';
    }
    return;
  }
  
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.progress == 100).length;
  
  const totalProgress = state.tasks.reduce((sum, t) => sum + parseInt(t.progress || 0), 0);
  const avgProgress = Math.round(totalProgress / total);
  
  const criticalCount = state.tasks.filter(t => t.isCritical).length;

  totalTasksVal.textContent = total;
  compTasksVal.textContent = completed;
  progressVal.textContent = `${avgProgress}%`;
  
  if (criticalVal) {
    criticalVal.textContent = criticalCount;
    const card = criticalVal.closest('.stat-card');
    if (criticalCount > 0) {
      card.style.border = '1px solid var(--danger)';
    } else {
      card.style.border = 'none';
    }
  }
}

// --- RESOURCE WORKLOAD CALCULATOR ---

function toggleWorkloadPanel() {
  const panel = document.getElementById('workload-panel');
  if (panel) {
    panel.classList.toggle('collapsed');
  }
}

function calculateAndRenderWorkload() {
  const container = document.getElementById('workload-body');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (state.tasks.length === 0 || state.members.length === 0) {
    container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">No resources scheduled.</div>';
    return;
  }
  
  // Calculate project dates boundary
  let projectMinDate = null;
  let projectMaxDate = null;
  
  state.tasks.forEach(t => {
    if (t.type === 'milestone') return; // skip milestones
    const start = new Date(t.start_date);
    const end = new Date(t.end_date);
    if (!projectMinDate || start < projectMinDate) projectMinDate = start;
    if (!projectMaxDate || end > projectMaxDate) projectMaxDate = end;
  });
  
  if (!projectMinDate) projectMinDate = new Date();
  if (!projectMaxDate) projectMaxDate = new Date();
  
  const projectTotalDays = Math.max(1, Math.ceil((projectMaxDate - projectMinDate) / (1000 * 60 * 60 * 24)) + 1);
  
  // Aggregate days per assignee
  // We compute workload load and detect overlapping schedule allocations
  const resourcesMap = {};
  state.members.forEach(member => {
    resourcesMap[member.id] = {
      username: member.username,
      activeDaysSet: new Set(),
      overlapDays: 0,
      tasksAssigned: []
    };
  });
  
  // Fill data from tasks
  state.tasks.forEach(task => {
    // Skip parents and milestones
    const isParent = state.tasks.some(t => t.parent_id == task.id);
    if (isParent || task.type === 'milestone' || !task.assignee_id || !resourcesMap[task.assignee_id]) return;
    
    const res = resourcesMap[task.assignee_id];
    res.tasksAssigned.push(task);
    
    // Generate dates list for this task
    let current = new Date(task.start_date);
    const end = new Date(task.end_date);
    
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      
      // If date is already active, it is an overlap day!
      if (res.activeDaysSet.has(dateStr)) {
        res.overlapDays++;
      } else {
        res.activeDaysSet.add(dateStr);
      }
      
      current.setDate(current.getDate() + 1);
    }
  });
  
  // Render bars
  let hasOverload = false;
  
  state.members.forEach(member => {
    const res = resourcesMap[member.id];
    const uniqueDays = res.activeDaysSet.size;
    
    if (res.tasksAssigned.length === 0) return; // skip idle members
    
    // Calculate percentage load relative to project duration
    const percentLoad = Math.min(100, Math.round((uniqueDays / projectTotalDays) * 100));
    
    // Workload classification color classes
    let barClass = 'normal';
    if (res.overlapDays > 0) {
      barClass = 'overload';
      hasOverload = true;
    } else if (percentLoad > 70) {
      barClass = 'warning';
    }
    
    const row = document.createElement('div');
    row.className = 'workload-user-row';
    
    row.innerHTML = `
      <div class="workload-user-name" title="${escapeHtml(res.username)}">${escapeHtml(res.username)}</div>
      <div class="workload-grid">
        <div class="workload-bar ${barClass}" style="width: ${percentLoad}%"></div>
      </div>
      <div class="workload-days-count">
        <span>${uniqueDays} days</span>
        ${res.overlapDays > 0 ? `<span style="color: var(--danger); font-size: 0.75em; display:block;" title="Overlapping tasks on same days">⚠️ Overallocated</span>` : ''}
      </div>
    `;
    container.appendChild(row);
  });
  
  if (container.children.length === 0) {
    container.innerHTML = '<div style="font-size: 0.85rem; color: var(--text-muted); text-align: center; padding: 1rem 0;">No resources scheduled.</div>';
  }
}


// --- PROJECT MODALS & SUBMISSIONS ---

function openProjectModal(projectId = null) {
  const modal = document.getElementById('modal-project');
  const title = document.getElementById('modal-project-title');
  const form = document.getElementById('form-project');
  
  form.reset();
  document.getElementById('project-action-type').value = projectId ? 'update' : 'create';
  document.getElementById('project-edit-id').value = projectId || '';
  
  if (projectId) {
    title.textContent = 'Edit Project';
    const project = state.projects.find(p => p.id == projectId);
    if (project) {
      document.getElementById('project-name').value = project.name;
      document.getElementById('project-desc').value = project.description || '';
      document.getElementById('project-start-date').value = project.start_date.split('T')[0];
    }
  } else {
    title.textContent = 'Create New Project';
    document.getElementById('project-start-date').value = new Date().toISOString().split('T')[0];
  }
  
  modal.classList.add('active');
}

function closeProjectModal() {
  document.getElementById('modal-project').classList.remove('active');
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  const type = document.getElementById('project-action-type').value;
  const id = document.getElementById('project-edit-id').value;
  
  const data = {
    name: document.getElementById('project-name').value,
    description: document.getElementById('project-desc').value,
    start_date: document.getElementById('project-start-date').value
  };
  
  const url = type === 'create' ? '/api/projects' : `/api/projects/${id}`;
  const method = type === 'create' ? 'POST' : 'PUT';
  
  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
      closeProjectModal();
      await fetchProjects();
      
      if (type === 'create') {
        selectProject(result.data.id);
      } else {
        selectProject(id);
      }
    } else {
      alert(result.message || 'Operation failed.');
    }
  } catch (error) {
    console.error('Project submit error:', error);
  }
}

async function deleteProject(projectId) {
  if (!confirm('Are you sure you want to delete this project? All associated tasks, files, and collaborators will be deleted.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      await fetchProjects();
      if (state.activeProjectId == projectId) {
        if (state.projects.length > 0) {
          selectProject(state.projects[0].id);
        } else {
          state.activeProjectId = null;
          renderEmptyState();
        }
      }
    } else {
      alert(result.message || 'Failed to delete project.');
    }
  } catch (error) {
    console.error('Delete project error:', error);
  }
}


// --- COLLABORATORS TEAM MODAL ---

function openMembersModal() {
  const modal = document.getElementById('modal-project-members');
  modal.classList.add('active');
  renderProjectMembersList();
}

function closeMembersModal() {
  document.getElementById('modal-project-members').classList.remove('active');
}

function renderProjectMembersList() {
  const list = document.getElementById('project-members-list');
  if (!list) return;
  list.innerHTML = '';
  
  state.members.forEach(member => {
    const li = document.createElement('li');
    li.className = 'project-member-li';
    
    const isOwner = member.role === 'owner';
    
    li.innerHTML = `
      <span style="font-weight: 500;">${escapeHtml(member.username)}</span>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span class="member-role-badge ${isOwner ? 'owner' : 'member'}">${member.role}</span>
        ${isOwner ? '' : `
          <button class="tbl-action-btn del" onclick="removeCollaborator(${member.id})" title="Remove member">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:0.95rem; height:0.95rem;">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        `}
      </div>
    `;
    list.appendChild(li);
  });
}

async function handleAddMember(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('member-username');
  const username = usernameInput.value;
  
  try {
    const response = await fetch(`/api/projects/${state.activeProjectId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    const result = await response.json();
    if (result.success) {
      usernameInput.value = '';
      await fetchProjectMembers(state.activeProjectId);
      renderProjectMembersList();
      renderTasks(); // Updates assignees list dropdown CANDIDATE
    } else {
      alert(result.message || 'Invitation failed.');
    }
  } catch (error) {
    console.error('Add member error:', error);
  }
}

async function removeCollaborator(userId) {
  if (!confirm('Remove collaborator from this project?')) return;
  
  try {
    const response = await fetch(`/api/projects/${state.activeProjectId}/members/${userId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      await fetchProjectMembers(state.activeProjectId);
      renderProjectMembersList();
      renderTasks();
    } else {
      alert(result.message || 'Removal failed.');
    }
  } catch (error) {
    console.error('Remove collaborator error:', error);
  }
}


// --- PROJECT AUDIT LOGS MODAL ---

async function openLogsModal() {
  const modal = document.getElementById('modal-activity-logs');
  modal.classList.add('active');
  
  const container = document.getElementById('activity-timeline-feed');
  if (!container) return;
  
  container.innerHTML = '<div style="text-align:center; padding:1rem;"><span class="spinner" style="border-top-color:var(--primary);"></span></div>';
  
  try {
    const response = await fetch(`/api/projects/${state.activeProjectId}/logs`);
    const result = await response.json();
    
    if (result.success) {
      container.innerHTML = '';
      if (result.data.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.95rem;">No activity logged yet.</div>';
        return;
      }
      
      result.data.forEach(log => {
        const row = document.createElement('div');
        row.className = 'activity-row';
        
        row.innerHTML = `
          <div class="activity-details-container">
            <span class="activity-action-badge">${escapeHtml(log.action)}</span>
            <span class="activity-details">${escapeHtml(log.details)}</span>
            <span class="activity-user-stamp">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>By <strong>${escapeHtml(log.username)}</strong> on ${formatDateFriendly(log.created_at)}</span>
            </span>
          </div>
        `;
        container.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
    container.innerHTML = '<div style="color:var(--danger)">Failed to load activity feed.</div>';
  }
}

function closeLogsModal() {
  document.getElementById('modal-activity-logs').classList.remove('active');
}


// --- BASELINE FREEZING ---

async function triggerProjectBaseline() {
  if (!confirm('Freeze current schedules as project baseline? This will copy active task dates into baseline slots for variance comparisons.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/projects/${state.activeProjectId}/baseline`, {
      method: 'POST'
    });
    const result = await response.json();
    if (result.success) {
      alert('Project baseline frozen successfully!');
      await fetchTasks(state.activeProjectId);
    } else {
      alert(result.message || 'Failed to save baseline.');
    }
  } catch (error) {
    console.error('Set baseline error:', error);
  }
}


// --- CSV EXPORTER ---

function exportProjectCSV() {
  if (!state.activeProjectId) return;
  // Express CSV endpoint auto triggers browser download attachment header
  window.location.href = `/api/projects/${state.activeProjectId}/export/csv`;
}


// --- TASK MODAL CRUD & TABS SUBMISSIONS ---

function openTaskModal(taskId = null, defaultParentId = null) {
  const modal = document.getElementById('modal-task');
  const title = document.getElementById('modal-task-title');
  const form = document.getElementById('form-task');
  const parentSelect = document.getElementById('task-parent');
  const assigneeSelect = document.getElementById('task-assignee');
  
  state.activeTaskIdForModal = taskId;
  form.reset();
  
  // Reset active tab to General Info
  document.querySelectorAll('#task-modal-tabs .modal-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('task-modal-tabs').firstElementChild.classList.add('active');
  
  document.querySelectorAll('.task-tab-content').forEach(c => c.classList.add('hidden'));
  document.getElementById('task-tab-general').classList.remove('hidden');
  
  // Populate Assignee Select
  assigneeSelect.innerHTML = '<option value="">(Unassigned)</option>';
  state.members.forEach(member => {
    const opt = document.createElement('option');
    opt.value = member.id;
    opt.textContent = member.username;
    assigneeSelect.appendChild(opt);
  });
  
  // Populate Parent Task Select Options
  parentSelect.innerHTML = '<option value="">(No Parent - Root Task)</option>';
  const parentCandidates = state.tasks.filter(t => !taskId || t.id != taskId);
  parentCandidates.forEach(t => {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.name;
    parentSelect.appendChild(option);
  });
  
  // Setup swatches
  setupColorPicker('#3b82f6');
  
  // If creating new task, hide comments and attachments tabs
  const tabComments = document.getElementById('tab-btn-comments');
  const tabFiles = document.getElementById('tab-btn-files');
  
  document.getElementById('task-action-type').value = taskId ? 'update' : 'create';
  document.getElementById('task-edit-id').value = taskId || '';
  
  if (taskId) {
    title.textContent = 'Edit Task';
    tabComments.classList.remove('hidden');
    tabFiles.classList.remove('hidden');
    
    const task = state.tasks.find(t => t.id == taskId);
    if (task) {
      document.getElementById('task-name').value = task.name;
      document.getElementById('task-start-date').value = task.start_date.split('T')[0];
      document.getElementById('task-end-date').value = task.end_date.split('T')[0];
      document.getElementById('task-progress').value = task.progress;
      document.getElementById('task-progress-output').textContent = `${task.progress}%`;
      assigneeSelect.value = task.assignee_id || '';
      parentSelect.value = task.parent_id || '';
      document.getElementById('task-type').value = task.type || 'task';
      
      setupColorPicker(task.color || '#3b82f6');
      toggleTaskTypeField();
      
      // Load comments and attachments
      fetchComments(taskId);
      fetchAttachments(taskId);
    }
  } else {
    title.textContent = 'Create New Task';
    tabComments.classList.add('hidden');
    tabFiles.classList.add('hidden');
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('task-start-date').value = today;
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    document.getElementById('task-end-date').value = nextWeek.toISOString().split('T')[0];
    document.getElementById('task-progress-output').textContent = '0%';
    document.getElementById('task-type').value = 'task';
    
    toggleTaskTypeField();
    
    if (defaultParentId) {
      parentSelect.value = defaultParentId;
    }
  }
  
  modal.classList.add('active');
}

function closeTaskModal() {
  document.getElementById('modal-task').classList.remove('active');
  state.activeTaskIdForModal = null;
}

function toggleTaskTypeField() {
  const type = document.getElementById('task-type').value;
  const sliderGroup = document.getElementById('progress-slider-group');
  const endDateField = document.getElementById('task-end-date');
  
  if (type === 'milestone') {
    sliderGroup.style.display = 'none';
    endDateField.disabled = true;
    // Milestones end date is same as start date
    endDateField.value = document.getElementById('task-start-date').value;
  } else {
    sliderGroup.style.display = 'flex';
    endDateField.disabled = false;
  }
}

// Sync Milestone dates when start date updates
const taskStartDateField = document.getElementById('task-start-date');
if (taskStartDateField) {
  taskStartDateField.addEventListener('input', (e) => {
    const type = document.getElementById('task-type').value;
    if (type === 'milestone') {
      document.getElementById('task-end-date').value = e.target.value;
    }
  });
}

function setupColorPicker(selectedColor) {
  const container = document.getElementById('color-swatches-container');
  const input = document.getElementById('task-color');
  
  container.innerHTML = '';
  input.value = selectedColor;
  
  TASK_COLORS.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = `color-swatch ${color === selectedColor ? 'active' : ''}`;
    swatch.style.backgroundColor = color;
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      input.value = color;
    });
    container.appendChild(swatch);
  });
}

const progressInput = document.getElementById('task-progress');
if (progressInput) {
  progressInput.addEventListener('input', (e) => {
    document.getElementById('task-progress-output').textContent = `${e.target.value}%`;
  });
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  const type = document.getElementById('task-action-type').value;
  const id = document.getElementById('task-edit-id').value;
  const taskType = document.getElementById('task-type').value;
  
  const data = {
    project_id: state.activeProjectId,
    name: document.getElementById('task-name').value,
    start_date: document.getElementById('task-start-date').value,
    end_date: taskType === 'milestone' ? document.getElementById('task-start-date').value : document.getElementById('task-end-date').value,
    progress: taskType === 'milestone' ? 0 : document.getElementById('task-progress').value,
    assignee_id: document.getElementById('task-assignee').value || null,
    parent_id: document.getElementById('task-parent').value || null,
    color: document.getElementById('task-color').value,
    type: taskType
  };
  
  const url = type === 'create' ? '/api/tasks' : `/api/tasks/${id}`;
  const method = type === 'create' ? 'POST' : 'PUT';
  
  if (taskType !== 'milestone' && data.start_date > data.end_date) {
    alert('Start date cannot be after end date.');
    return;
  }
  
  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    
    const result = await response.json();
    if (result.success) {
      closeTaskModal();
      await fetchTasks(state.activeProjectId);
    } else {
      alert(result.message || 'Operation failed.');
    }
  } catch (error) {
    console.error('Task submit error:', error);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task? Any subtasks and dependencies will also be affected.')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    
    if (result.success) {
      await fetchTasks(state.activeProjectId);
    } else {
      alert(result.message || 'Failed to delete task.');
    }
  } catch (error) {
    console.error('Delete task error:', error);
  }
}


// --- COMMENTS FEED LOGIC ---

async function fetchComments(taskId) {
  const feed = document.getElementById('comments-feed-container');
  if (!feed) return;
  feed.innerHTML = '<div style="text-align:center;"><span class="spinner" style="border-top-color:var(--primary);"></span></div>';
  
  try {
    const response = await fetch(`/api/tasks/${taskId}/comments`);
    const result = await response.json();
    
    if (result.success) {
      feed.innerHTML = '';
      if (result.data.length === 0) {
        feed.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:1rem 0;">No comments yet.</div>';
        return;
      }
      
      result.data.forEach(c => {
        const bubble = document.createElement('div');
        bubble.className = 'comment-bubble';
        bubble.innerHTML = `
          <div class="comment-header">
            <span class="comment-author">${escapeHtml(c.username)}</span>
            <span class="comment-date">${formatDateFriendly(c.created_at)}</span>
          </div>
          <div class="comment-body">${escapeHtml(c.content)}</div>
        `;
        feed.appendChild(bubble);
      });
      // Scroll to bottom
      feed.scrollTop = feed.scrollHeight;
    }
  } catch (error) {
    console.error('Fetch comments error:', error);
    feed.innerHTML = '<div style="color:var(--danger); font-size:0.8rem;">Failed to load comments.</div>';
  }
}

async function submitComment() {
  const taskId = state.activeTaskIdForModal;
  const textInput = document.getElementById('new-comment-text');
  const content = textInput.value;
  
  if (!content || !content.trim() || !taskId) return;
  
  try {
    const response = await fetch(`/api/tasks/${taskId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    
    const result = await response.json();
    if (result.success) {
      textInput.value = '';
      await fetchComments(taskId);
      // Logs are refreshed in backend log activity automatically
    } else {
      alert(result.message || 'Failed to post comment.');
    }
  } catch (error) {
    console.error('Comment submit error:', error);
  }
}


// --- ATTACHMENTS FILE LOGIC ---

async function fetchAttachments(taskId) {
  const container = document.getElementById('attachments-list-container');
  if (!container) return;
  container.innerHTML = '<div style="text-align:center;"><span class="spinner" style="border-top-color:var(--primary);"></span></div>';
  
  try {
    const response = await fetch(`/api/tasks/${taskId}/attachments`);
    const result = await response.json();
    
    if (result.success) {
      container.innerHTML = '';
      if (result.data.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-muted); font-size:0.8rem; padding:1rem 0;">No file attachments yet.</div>';
        return;
      }
      
      result.data.forEach(file => {
        const sizeMb = (file.filesize / (1024 * 1024)).toFixed(2);
        const row = document.createElement('div');
        row.className = 'attachment-row';
        
        row.innerHTML = `
          <div class="attachment-info" title="${escapeHtml(file.filename)}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div style="display:flex; flex-direction:column; overflow:hidden;">
              <span class="attachment-name">${escapeHtml(file.filename)}</span>
              <span class="attachment-size">${sizeMb} MB • Uploaded by ${escapeHtml(file.username)}</span>
            </div>
          </div>
          <div class="attachment-actions">
            <a href="/api/attachments/${file.id}/download" class="tbl-action-btn" title="Download file" target="_blank">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:0.95rem; height:0.95rem;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
            <button type="button" class="tbl-action-btn del" onclick="deleteAttachment(${file.id})" title="Delete attachment">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:0.95rem; height:0.95rem;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        `;
        container.appendChild(row);
      });
    }
  } catch (error) {
    console.error('Fetch attachments error:', error);
    container.innerHTML = '<div style="color:var(--danger); font-size:0.8rem;">Failed to load attachments.</div>';
  }
}

async function submitAttachment() {
  const taskId = state.activeTaskIdForModal;
  const fileInput = document.getElementById('new-file-input');
  
  if (!fileInput.files.length || !taskId) return;
  
  const file = fileInput.files[0];
  const formData = new FormData();
  formData.append('file', file);
  
  const btn = document.querySelector('.upload-file-form button');
  btn.disabled = true;
  btn.textContent = '...';
  
  try {
    const response = await fetch(`/api/tasks/${taskId}/attachments`, {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    if (result.success) {
      fileInput.value = '';
      await fetchAttachments(taskId);
    } else {
      alert(result.message || 'File upload failed.');
    }
  } catch (error) {
    console.error('File upload error:', error);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Upload';
  }
}

async function deleteAttachment(attachmentId) {
  if (!confirm('Permanently delete this file attachment?')) return;
  
  try {
    const response = await fetch(`/api/attachments/${attachmentId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (result.success) {
      await fetchAttachments(state.activeTaskIdForModal);
    } else {
      alert(result.message || 'Delete failed.');
    }
  } catch (error) {
    console.error('Delete attachment error:', error);
  }
}


// --- CRITICAL PATH ENGINE ---

function calculateCriticalPath() {
  state.tasks.forEach(t => t.isCritical = false);
  
  if (state.tasks.length === 0) return;
  
  const tasks = [...state.tasks];
  const dependencies = state.dependencies;
  
  const getDuration = (t) => {
    if (t.type === 'milestone') return 0;
    return Math.ceil((new Date(t.end_date) - new Date(t.start_date)) / (1000 * 60 * 60 * 24)) + 1;
  };
  
  const calc = {};
  tasks.forEach(t => {
    calc[t.id] = {
      task: t,
      duration: getDuration(t),
      predecessors: dependencies.filter(d => d.task_id == t.id).map(d => parseInt(d.predecessor_id)),
      successors: dependencies.filter(d => d.predecessor_id == t.id).map(d => parseInt(d.task_id)),
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      slack: 0
    };
  });
  
  const resolvedES = new Set();
  
  function calculateES(id) {
    if (resolvedES.has(id)) return calc[id].es;
    
    const node = calc[id];
    if (node.predecessors.length === 0) {
      node.es = 0;
    } else {
      let maxEF = 0;
      node.predecessors.forEach(predId => {
        if (calc[predId]) {
          const predEF = calculateES(predId) + calc[predId].duration;
          if (predEF > maxEF) maxEF = predEF;
        }
      });
      node.es = maxEF;
    }
    node.ef = node.es + node.duration;
    resolvedES.add(id);
    return node.es;
  }
  
  tasks.forEach(t => calculateES(t.id));
  
  let projectEF = 0;
  tasks.forEach(t => {
    if (calc[t.id].ef > projectEF) projectEF = calc[t.id].ef;
  });
  
  const resolvedLS = new Set();
  
  function calculateLS(id) {
    if (resolvedLS.has(id)) return calc[id].ls;
    
    const node = calc[id];
    if (node.successors.length === 0) {
      node.lf = projectEF;
    } else {
      let minLS = Infinity;
      node.successors.forEach(succId => {
        if (calc[succId]) {
          const succLS = calculateLS(succId);
          if (succLS < minLS) minLS = succLS;
        }
      });
      node.lf = minLS;
    }
    node.ls = node.lf - node.duration;
    node.slack = node.ls - node.es;
    resolvedLS.add(id);
    return node.ls;
  }
  
  tasks.forEach(t => calculateLS(t.id));
  
  tasks.forEach(t => {
    const node = calc[t.id];
    // A task is critical if slack is zero, but only if project duration > 0
    if (node && node.slack === 0 && projectEF > 0) {
      t.isCritical = true;
    }
  });
}


// --- UTILITIES ---

function formatDateFriendly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(string) {
  if (!string) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return string.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// --- DYNAMIC PRINT REPORT GENERATOR ---
async function preparePrintReport() {
  const container = document.getElementById('print-report-container');
  if (!container) return;
  
  if (!state.activeProjectId) {
    container.innerHTML = '<h2>No active project selected to print.</h2>';
    return;
  }
  
  const project = state.projects.find(p => p.id == state.activeProjectId);
  if (!project) return;
  
  // Calculate project dates boundary
  let pMin = null;
  let pMax = null;
  state.tasks.forEach(t => {
    const start = new Date(t.start_date);
    const end = new Date(t.end_date);
    if (!pMin || start < pMin) pMin = start;
    if (!pMax || end > pMax) pMax = end;
  });
  
  if (!pMin) pMin = new Date(project.start_date);
  if (!pMax) pMax = new Date();
  
  const projectTotalDays = Math.max(1, Math.ceil((pMax - pMin) / (1000 * 60 * 60 * 24)) + 1);
  const totalMs = pMax.getTime() - pMin.getTime();
  
  // Average Progress
  const totalTasks = state.tasks.length;
  const completedTasks = state.tasks.filter(t => t.progress == 100).length;
  const totalProgress = state.tasks.reduce((sum, t) => sum + parseInt(t.progress || 0), 0);
  const avgProgress = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;
  
  // Calculate critical path before printing
  calculateCriticalPath();
  const criticalCount = state.tasks.filter(t => t.isCritical).length;
  
  // Resource workloads
  const resourcesMap = {};
  state.members.forEach(member => {
    resourcesMap[member.id] = {
      username: member.username,
      activeDaysSet: new Set(),
      overlapDays: 0,
      tasksCount: 0
    };
  });
  
  state.tasks.forEach(task => {
    const isParent = state.tasks.some(t => t.parent_id == task.id);
    if (isParent || task.type === 'milestone' || !task.assignee_id || !resourcesMap[task.assignee_id]) return;
    
    const res = resourcesMap[task.assignee_id];
    res.tasksCount++;
    let current = new Date(task.start_date);
    const end = new Date(task.end_date);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      if (res.activeDaysSet.has(dateStr)) {
        res.overlapDays++;
      } else {
        res.activeDaysSet.add(dateStr);
      }
      current.setDate(current.getDate() + 1);
    }
  });
  
  // Fetch activity logs for the report
  let logsHtml = '';
  try {
    const response = await fetch(`/api/projects/${state.activeProjectId}/logs`);
    const result = await response.json();
    if (result.success && result.data.length > 0) {
      // Show latest 10 logs
      const recentLogs = result.data.slice(0, 10);
      recentLogs.forEach(log => {
        logsHtml += `
          <div class="print-log-item">
            <span class="print-log-action">${escapeHtml(log.action)}</span>
            <span class="print-log-details">${escapeHtml(log.details)}</span>
            <span class="print-log-meta">by ${escapeHtml(log.username)} on ${formatDateFriendly(log.created_at)}</span>
          </div>
        `;
      });
    } else {
      logsHtml = '<div class="print-no-data">No recent activity logged.</div>';
    }
  } catch (error) {
    console.error('Error fetching logs for print:', error);
    logsHtml = '<div class="print-no-data">Failed to load activity log.</div>';
  }
  
  // Flatten tasks tree hierarchy
  const flatTasks = [];
  function flattenTree(nodes, depth = 0) {
    nodes.forEach(node => {
      flatTasks.push({ task: node.task, depth: depth, hasChildren: node.children.length > 0 });
      flattenTree(node.children, depth + 1);
    });
  }
  const taskTree = buildTaskHierarchy(state.tasks);
  flattenTree(taskTree, 0);
  
  // Generate task list HTML with timeline bars
  let tasksRowsHtml = '';
  flatTasks.forEach(item => {
    const t = item.task;
    const isMilestone = t.type === 'milestone';
    const isParent = item.hasChildren;
    
    // Assignee
    const member = state.members.find(m => m.id == t.assignee_id);
    const assigneeName = member ? member.username : '—';
    
    // Timeline calculation
    let leftPercent = 0;
    let widthPercent = 0;
    const taskStartMs = new Date(t.start_date).getTime();
    
    if (totalMs > 0) {
      leftPercent = ((taskStartMs - pMin.getTime()) / totalMs) * 100;
      leftPercent = Math.max(0, Math.min(100, leftPercent));
      
      if (isMilestone) {
        widthPercent = 2;
      } else {
        const taskEndMs = new Date(t.end_date).getTime();
        widthPercent = ((taskEndMs - taskStartMs) / totalMs) * 100;
        widthPercent = Math.max(1, Math.min(100 - leftPercent, widthPercent));
      }
    } else {
      widthPercent = 100;
    }
    
    // Timeline HTML bar
    let barHtml = '';
    if (isMilestone) {
      barHtml = `<div class="print-timeline-milestone" style="left: ${leftPercent}%;" title="${formatDateFriendly(t.start_date)}">◆</div>`;
    } else {
      const taskColor = t.color || '#3b82f6';
      barHtml = `
        <div class="print-timeline-bar-bg" style="left: ${leftPercent}%; width: ${widthPercent}%;">
          <div class="print-timeline-bar-fill" style="width: ${t.progress}%; background-color: ${taskColor};"></div>
        </div>
      `;
    }
    
    // Row classes
    const rowClass = `${isParent ? 'print-parent-row' : ''} ${t.isCritical ? 'print-critical-row' : ''}`;
    const nameIndent = item.depth * 15;
    
    tasksRowsHtml += `
      <tr class="${rowClass}">
        <td style="padding-left: ${nameIndent + 8}px; font-weight: ${isParent ? 'bold' : 'normal'};">
          ${isMilestone ? '<span style="color:var(--primary)">◆</span> ' : ''}${escapeHtml(t.name)}
          ${t.isCritical ? ' <span class="print-critical-badge">CRITICAL</span>' : ''}
        </td>
        <td>${formatDateFriendly(t.start_date)}</td>
        <td>${isMilestone ? '—' : formatDateFriendly(t.end_date)}</td>
        <td>${escapeHtml(assigneeName)}</td>
        <td>${isMilestone ? '—' : t.progress + '%'}</td>
        <td class="print-timeline-cell" style="position: relative;">
          <div style="height: 16px; min-width: 150px;"></div>
          ${barHtml}
        </td>
      </tr>
    `;
  });
  
  // Resource workload rows
  let resourceRowsHtml = '';
  state.members.forEach(m => {
    const res = resourcesMap[m.id];
    if (res.tasksCount === 0) return; // skip inactive
    
    const totalDays = res.activeDaysSet.size;
    let statusBadge = '';
    if (res.overlapDays > 0) {
      statusBadge = '<span class="print-badge danger">⚠️ Overallocated</span>';
    } else if (totalDays > 0) {
      statusBadge = '<span class="print-badge success">Active</span>';
    }
    
    resourceRowsHtml += `
      <tr>
        <td><strong>${escapeHtml(res.username)}</strong></td>
        <td>${totalDays} Days</td>
        <td>${res.tasksCount} Tasks</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  });
  
  if (!resourceRowsHtml) {
    resourceRowsHtml = '<tr><td colspan="4" class="text-center">No active team members scheduled.</td></tr>';
  }
  
  // Construct the entire report HTML
  container.innerHTML = `
    <div class="print-report-wrapper">
      <div class="print-report-header">
        <div class="print-header-brand">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:24px; height:24px; color:#1e3a8a; stroke-width:2.5; display:inline-block; vertical-align:middle; margin-right:4px;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0V18m0-1.5H9m0 1.5v1.5m0-1.5h7.5m0 0V18m0-1.5h1.5M9 18h7.5" />
          </svg>
          <span style="vertical-align:middle;">PlanFlow Project Planner</span>
        </div>
        <div class="print-header-date">
          Report Generated: <strong>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
        </div>
      </div>
      
      <div class="print-report-title-section">
        <h1>PROJECT STATUS REPORT</h1>
        <p class="print-subtitle">Comprehensive summary, task roadmap, and resource workloads</p>
      </div>
      
      <div class="print-project-details-card">
        <div class="print-details-col">
          <div class="print-detail-item">
            <span class="label">Project Name:</span>
            <span class="value" style="font-weight: 700; font-size: 1.15rem; color:#0f172a;">${escapeHtml(project.name)}</span>
          </div>
          <div class="print-detail-item">
            <span class="label">Description:</span>
            <span class="value">${escapeHtml(project.description || 'No description provided.')}</span>
          </div>
        </div>
        <div class="print-details-col">
          <div class="print-detail-item">
            <span class="label">Start Date:</span>
            <span class="value">${formatDateFriendly(project.start_date)}</span>
          </div>
          <div class="print-detail-item">
            <span class="label">Project Bounds:</span>
            <span class="value">${formatDateFriendly(pMin)} to ${formatDateFriendly(pMax)}</span>
          </div>
          <div class="print-detail-item">
            <span class="label">Total Duration:</span>
            <span class="value">${projectTotalDays} calendar days</span>
          </div>
        </div>
      </div>
      
      <div class="print-metrics-row">
        <div class="print-metric-card">
          <span class="val">${totalTasks}</span>
          <span class="lbl">Total Tasks</span>
        </div>
        <div class="print-metric-card">
          <span class="val">${completedTasks}</span>
          <span class="lbl">Completed Tasks</span>
        </div>
        <div class="print-metric-card">
          <span class="val">${avgProgress}%</span>
          <span class="lbl">Average Progress</span>
        </div>
        <div class="print-metric-card ${criticalCount > 0 ? 'critical' : ''}">
          <span class="val">${criticalCount}</span>
          <span class="lbl">Critical Path Tasks</span>
        </div>
      </div>
      
      <div class="print-section">
        <h2 class="print-section-title">1. Task Roadmaps & Gantt Schedule</h2>
        <table class="print-data-table">
          <thead>
            <tr>
              <th style="width: 32%;">Task Name</th>
              <th style="width: 12%;">Start</th>
              <th style="width: 12%;">End</th>
              <th style="width: 12%;">Assignee</th>
              <th style="width: 8%;">Progress</th>
              <th style="width: 24%; text-align: center;">Timeline (Relative)</th>
            </tr>
          </thead>
          <tbody>
            ${tasksRowsHtml}
          </tbody>
        </table>
      </div>
      
      <div class="print-section page-break">
        <h2 class="print-section-title">2. Team Allocations & Resource Loading</h2>
        <table class="print-data-table">
          <thead>
            <tr>
              <th style="width: 30%;">Team Collaborator</th>
              <th style="width: 25%;">Allocated Days</th>
              <th style="width: 20%;">Total Tasks Assigned</th>
              <th style="width: 25%;">Allocation Status</th>
            </tr>
          </thead>
          <tbody>
            ${resourceRowsHtml}
          </tbody>
        </table>
      </div>
      
      <div class="print-section">
        <h2 class="print-section-title">3. Recent Project Activities (Audit Logs)</h2>
        <div class="print-logs-container">
          ${logsHtml}
        </div>
      </div>
      
      <div class="print-signature-section">
        <div class="print-sig-col">
          <span class="sig-title">Prepared By:</span>
          <div class="sig-line"></div>
          <span class="sig-name">${escapeHtml(state.currentUser || 'Project Manager')}</span>
          <span class="sig-designation">PlanFlow System Owner</span>
        </div>
        <div class="print-sig-col">
          <span class="sig-title">Approved By:</span>
          <div class="sig-line"></div>
          <span class="sig-name">_________________________________</span>
          <span class="sig-designation">Stakeholder / Client Representative</span>
        </div>
      </div>
    </div>
  `;
}
