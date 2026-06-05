/* gantt.js - Interactive Gantt Chart Engine */

// Global Gantt variables
let timelineMinDate = null;
let timelineMaxDate = null;
let pxPerDay = 40; // Scale factor, pixels per day
let isDrawingDependency = false;
let dependencyStartTaskId = null;
let dependencyStartNodeCoords = null;

// Primary entry point called by app.js when tasks are rendered
function initGanttChart() {
  if (state.tasks.length === 0) return;
  
  calculateTimelineBounds();
  renderTimelineHeaders();
  renderGridColumns();
  renderTaskBars();
  setTimeout(drawDependencyLines, 50); // Small timeout to ensure DOM styles have compiled
  setupConnectorDragging();
}

// 1. Calculate the start and end boundaries of the scrollable timeline
function calculateTimelineBounds() {
  let min = null;
  let max = null;
  
  // Find project baseline start date if available
  const activeProj = state.projects.find(p => p.id == state.activeProjectId);
  if (activeProj) {
    min = new Date(activeProj.start_date);
  }
  
  state.tasks.forEach(task => {
    const start = new Date(task.start_date);
    const end = new Date(task.end_date);
    
    if (!min || start < min) min = start;
    if (!max || end > max) max = end;
  });
  
  // Default fallback if parsing failed
  if (!min) min = new Date();
  if (!max) max = new Date();
  
  // Add padding padding buffer to the timeline
  timelineMinDate = new Date(min);
  timelineMinDate.setDate(timelineMinDate.getDate() - 5); // 5 days padding before
  
  timelineMaxDate = new Date(max);
  timelineMaxDate.setDate(timelineMaxDate.getDate() + 25); // 25 days padding after
  
  // Adjust pixel scale depending on zoom level
  const totalDays = Math.ceil((timelineMaxDate - timelineMinDate) / (1000 * 60 * 60 * 24)) + 1;
  
  if (state.zoomLevel === 'day') {
    pxPerDay = 44; // Wide day columns
  } else if (state.zoomLevel === 'week') {
    pxPerDay = 15; // Compact day widths, week is ~100px
  } else {
    pxPerDay = 4.5; // Very compact, month is ~135px
  }
}

// 2. Render the timeline headers (Months, Weeks, or Days)
function renderTimelineHeaders() {
  const header = document.getElementById('gantt-chart-header');
  if (!header) return;
  header.innerHTML = '';
  
  const totalDays = Math.ceil((timelineMaxDate - timelineMinDate) / (1000 * 60 * 60 * 24)) + 1;
  const current = new Date(timelineMinDate);
  
  if (state.zoomLevel === 'day') {
    for (let i = 0; i < totalDays; i++) {
      const block = document.createElement('div');
      block.className = 'timeline-block';
      block.style.width = `${pxPerDay}px`;
      
      const dayNum = current.getDate();
      const dayName = current.toLocaleDateString('en-US', { weekday: 'narrow' });
      const monthName = current.toLocaleDateString('en-US', { month: 'short' });
      
      block.innerHTML = `
        <span class="timeline-block-top">${dayName}</span>
        <span class="timeline-block-bottom">${dayNum}</span>
      `;
      block.title = `${current.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
      
      header.appendChild(block);
      current.setDate(current.getDate() + 1);
    }
  } else if (state.zoomLevel === 'week') {
    const totalWeeks = Math.ceil(totalDays / 7);
    for (let i = 0; i < totalWeeks; i++) {
      const block = document.createElement('div');
      block.className = 'timeline-block';
      block.style.width = `${pxPerDay * 7}px`;
      
      const weekEnd = new Date(current);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      const labelTop = current.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const labelBottom = `W${i+1}`;
      
      block.innerHTML = `
        <span class="timeline-block-top">${labelTop}</span>
        <span class="timeline-block-bottom">${current.getDate()}-${weekEnd.getDate()}</span>
      `;
      block.title = `Week ${i+1}: ${current.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`;
      header.appendChild(block);
      current.setDate(current.getDate() + 7);
    }
  } else {
    let tempDate = new Date(timelineMinDate);
    while (tempDate <= timelineMaxDate) {
      const monthStart = new Date(tempDate.getFullYear(), tempDate.getMonth(), 1);
      const nextMonth = new Date(tempDate.getFullYear(), tempDate.getMonth() + 1, 1);
      const daysInMonth = Math.ceil((nextMonth - monthStart) / (1000 * 60 * 60 * 24));
      
      const blockWidth = daysInMonth * pxPerDay;
      
      const block = document.createElement('div');
      block.className = 'timeline-block';
      block.style.width = `${blockWidth}px`;
      
      const labelTop = tempDate.getFullYear();
      const labelBottom = tempDate.toLocaleDateString('en-US', { month: 'short' });
      
      block.innerHTML = `
        <span class="timeline-block-top">${labelTop}</span>
        <span class="timeline-block-bottom">${labelBottom}</span>
      `;
      block.title = tempDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      header.appendChild(block);
      
      tempDate.setMonth(tempDate.getMonth() + 1);
    }
  }
}

// 3. Render vertical grid columns
function renderGridColumns() {
  const container = document.getElementById('gantt-grid-cols');
  if (!container) return;
  container.innerHTML = '';
  
  const totalDays = Math.ceil((timelineMaxDate - timelineMinDate) / (1000 * 60 * 60 * 24)) + 1;
  const current = new Date(timelineMinDate);
  
  if (state.zoomLevel === 'day') {
    for (let i = 0; i < totalDays; i++) {
      const col = document.createElement('div');
      col.className = 'grid-col';
      col.style.width = `${pxPerDay}px`;
      
      const day = current.getDay();
      if (day === 0 || day === 6) {
        col.classList.add('weekend');
      }
      container.appendChild(col);
      current.setDate(current.getDate() + 1);
    }
  } else if (state.zoomLevel === 'week') {
    const totalWeeks = Math.ceil(totalDays / 7);
    for (let i = 0; i < totalWeeks; i++) {
      const col = document.createElement('div');
      col.className = 'grid-col';
      col.style.width = `${pxPerDay * 7}px`;
      container.appendChild(col);
    }
  } else {
    let tempDate = new Date(timelineMinDate);
    while (tempDate <= timelineMaxDate) {
      const monthStart = new Date(tempDate.getFullYear(), tempDate.getMonth(), 1);
      const nextMonth = new Date(tempDate.getFullYear(), tempDate.getMonth() + 1, 1);
      const daysInMonth = Math.ceil((nextMonth - monthStart) / (1000 * 60 * 60 * 24));
      
      const col = document.createElement('div');
      col.className = 'grid-col';
      col.style.width = `${daysInMonth * pxPerDay}px`;
      container.appendChild(col);
      
      tempDate.setMonth(tempDate.getMonth() + 1);
    }
  }
}

function dateToPx(dateStr) {
  const date = new Date(dateStr);
  const diffTime = date - timelineMinDate;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays * pxPerDay;
}

function pxToDate(px) {
  const diffDays = px / pxPerDay;
  const date = new Date(timelineMinDate);
  date.setDate(date.getDate() + diffDays);
  return date;
}

// 4. Render Gantt task bars
function renderTaskBars() {
  state.tasks.forEach(task => {
    const rowPlaceholder = document.querySelector(`.gantt-row-placeholder-${task.id}`);
    if (!rowPlaceholder) return;
    
    const isParent = state.tasks.some(t => t.parent_id == task.id);
    const isMilestone = task.type === 'milestone';
    
    const left = dateToPx(task.start_date);
    const right = dateToPx(task.end_date) + pxPerDay;
    let width = Math.max(pxPerDay, right - left);
    if (isMilestone) {
      width = pxPerDay; // Milestones are fixed at 1 day scale width
    }
    
    const barWrapper = document.createElement('div');
    barWrapper.className = `gantt-bar-wrapper ${isParent ? 'parent-task' : ''} ${isMilestone ? 'milestone-task' : ''} ${task.isCritical ? 'critical-task' : ''}`;
    barWrapper.dataset.taskId = task.id;
    barWrapper.style.left = `${left}px`;
    barWrapper.style.width = `${width}px`;
    barWrapper.style.zIndex = 5;
    
    const customBgColor = task.color || '#3b82f6';
    
    barWrapper.innerHTML = `
      <div class="gantt-bar" style="background-color: ${isParent ? '#64748b' : customBgColor}">
        ${isMilestone ? '' : `<div class="gantt-bar-progress" style="width: ${task.progress || 0}%"></div>`}
        <div class="gantt-handle gantt-handle-left" data-handle="left"></div>
        <div class="gantt-handle gantt-handle-right" data-handle="right"></div>
      </div>
      
      <div class="gantt-connector-node connector-in" data-direction="in" title="Predecessor connector (Drag here)"></div>
      <div class="gantt-connector-node connector-out" data-direction="out" title="Drag to make successor"></div>
      
      <span class="gantt-bar-label">${escapeHtml(task.name)} ${isMilestone ? '◆' : `(${task.progress || 0}%)`}</span>
    `;

    // Render Baseline Bar Shadow if baseline dates are configured
    if (task.baseline_start_date && task.baseline_end_date) {
      const bLeft = dateToPx(task.baseline_start_date);
      const bRight = dateToPx(task.baseline_end_date) + pxPerDay;
      const bWidth = Math.max(pxPerDay, bRight - bLeft);

      const baselineEl = document.createElement('div');
      baselineEl.className = 'baseline-bar';
      baselineEl.style.left = `${bLeft - left}px`; // relative to wrapper start coordinate
      baselineEl.style.width = `${bWidth}px`;
      baselineEl.title = `Baseline Schedule: ${task.baseline_start_date.split('T')[0]} to ${task.baseline_end_date.split('T')[0]}`;
      barWrapper.appendChild(baselineEl);
    }
    
    rowPlaceholder.appendChild(barWrapper);
    
    if (!isParent) {
      setupTaskInteractiveEvents(barWrapper);
    }
  });
}

// 5. Setup Drag & Resize Mouse Handlers
function setupTaskInteractiveEvents(barWrapper) {
  const taskId = parseInt(barWrapper.dataset.taskId);
  const task = state.tasks.find(t => t.id == taskId);
  const isMilestone = task && task.type === 'milestone';
  
  let isDragging = false;
  let isResizing = false;
  let resizeDirection = null;
  let startX = 0;
  let initialLeft = 0;
  let initialWidth = 0;
  
  barWrapper.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (e.target.classList.contains('gantt-connector-node')) return;
    
    if (e.target.classList.contains('gantt-handle')) {
      if (isMilestone) return; // Milestones cannot be resized (duration must be 0)
      isResizing = true;
      resizeDirection = e.target.dataset.handle;
      initialLeft = parseFloat(barWrapper.style.left);
      initialWidth = parseFloat(barWrapper.style.width);
      startX = e.clientX;
      barWrapper.classList.add('dragging');
      e.stopPropagation();
      return;
    }
    
    isDragging = true;
    initialLeft = parseFloat(barWrapper.style.left);
    startX = e.clientX;
    barWrapper.classList.add('dragging');
    e.stopPropagation();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDragging && !isResizing) return;
    
    const dx = e.clientX - startX;
    
    if (isDragging) {
      const newLeft = Math.max(0, initialLeft + dx);
      barWrapper.style.left = `${newLeft}px`;
      
      const newStartDate = pxToDate(newLeft).toISOString().split('T')[0];
      const width = parseFloat(barWrapper.style.width);
      const newEndDate = pxToDate(newLeft + width - pxPerDay).toISOString().split('T')[0];
      const label = barWrapper.querySelector('.gantt-bar-label');
      const task = state.tasks.find(t => t.id == taskId);
      if (label && task) {
        label.textContent = `${task.name} (${newStartDate} to ${newEndDate})`;
      }
    }
    
    if (isResizing) {
      if (resizeDirection === 'right') {
        const newWidth = Math.max(pxPerDay, initialWidth + dx);
        barWrapper.style.width = `${newWidth}px`;
      } else if (resizeDirection === 'left') {
        const newLeft = Math.min(initialLeft + initialWidth - pxPerDay, Math.max(0, initialLeft + dx));
        const newWidth = initialWidth + (initialLeft - newLeft);
        barWrapper.style.left = `${newLeft}px`;
        barWrapper.style.width = `${newWidth}px`;
      }
      
      const currentLeft = parseFloat(barWrapper.style.left);
      const currentWidth = parseFloat(barWrapper.style.width);
      const newStartDate = pxToDate(currentLeft).toISOString().split('T')[0];
      const newEndDate = pxToDate(currentLeft + currentWidth - pxPerDay).toISOString().split('T')[0];
      const label = barWrapper.querySelector('.gantt-bar-label');
      const task = state.tasks.find(t => t.id == taskId);
      if (label && task) {
        label.textContent = `${task.name} (${newStartDate} to ${newEndDate})`;
      }
    }
    
    drawDependencyLines();
  });
  
  document.addEventListener('mouseup', async () => {
    if (!isDragging && !isResizing) return;
    
    barWrapper.classList.remove('dragging');
    
    const finalLeft = parseFloat(barWrapper.style.left);
    const finalWidth = parseFloat(barWrapper.style.width);
    
    const newStartDate = pxToDate(finalLeft).toISOString().split('T')[0];
    const newEndDate = pxToDate(finalLeft + finalWidth - pxPerDay).toISOString().split('T')[0];
    
    isDragging = false;
    isResizing = false;
    resizeDirection = null;
    
    const task = state.tasks.find(t => t.id == taskId);
    if (!task) return;
    
    if (task.start_date === newStartDate && task.end_date === newEndDate) {
      renderTasks();
      return;
    }
    
    const updateData = {
      name: task.name,
      start_date: newStartDate,
      end_date: newEndDate,
      progress: task.progress,
      color: task.color,
      assignee: task.assignee,
      parent_id: task.parent_id
    };
    
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      const result = await response.json();
      
      if (result.success) {
        await fetchTasks(state.activeProjectId);
      } else {
        alert(result.message || 'Failed to update schedule.');
        renderTasks();
      }
    } catch (error) {
      console.error('Task update fetch error:', error);
      renderTasks();
    }
  });
}

// 6. Draw Stepped Orthogonal Lines in SVG
function drawDependencyLines() {
  const svg = document.getElementById('gantt-svg-overlay');
  if (!svg) return;
  
  const existingLines = svg.querySelectorAll('path.gantt-dependency-line');
  existingLines.forEach(l => l.remove());
  
  const bodyRect = document.getElementById('gantt-rows-container').getBoundingClientRect();
  
  state.dependencies.forEach(dep => {
    const predBar = document.querySelector(`.gantt-bar-wrapper[data-task-id="${dep.predecessor_id}"]`);
    const succBar = document.querySelector(`.gantt-bar-wrapper[data-task-id="${dep.task_id}"]`);
    
    if (!predBar || !succBar) return;
    
    const outNode = predBar.querySelector('.connector-out');
    const inNode = succBar.querySelector('.connector-in');
    
    if (!outNode || !inNode) return;
    
    const outRect = outNode.getBoundingClientRect();
    const inRect = inNode.getBoundingClientRect();
    
    const x1 = outRect.left - bodyRect.left + outRect.width / 2;
    const y1 = outRect.top - bodyRect.top + outRect.height / 2;
    
    const x2 = inRect.left - bodyRect.left + inRect.width / 2;
    const y2 = inRect.top - bodyRect.top + inRect.height / 2;
    
    const midX = x1 + 12;
    
    let pathData;
    if (x2 > x1) {
      pathData = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    } else {
      const backOffset = 16;
      pathData = `M ${x1} ${y1} L ${x1 + backOffset} ${y1} L ${x1 + backOffset} ${y1 + 18} L ${x2 - backOffset} ${y1 + 18} L ${x2 - backOffset} ${y2} L ${x2} ${y2}`;
    }
    
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    
    const predTask = state.tasks.find(t => t.id == dep.predecessor_id);
    const succTask = state.tasks.find(t => t.id == dep.task_id);
    const isCriticalDep = state.showCriticalPath && predTask && succTask && predTask.isCritical && succTask.isCritical;
    
    path.setAttribute('d', pathData);
    path.setAttribute('class', `gantt-dependency-line interactive ${isCriticalDep ? 'critical-dependency' : ''}`);
    path.setAttribute('marker-end', isCriticalDep ? 'url(#arrow-critical)' : 'url(#arrow)');
    path.setAttribute('data-predecessor-id', dep.predecessor_id);
    path.setAttribute('data-task-id', dep.task_id);
    
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDependency(dep.task_id, dep.predecessor_id);
    });
    
    svg.appendChild(path);
  });
}

// 7. Interactive connector node dragging
function setupConnectorDragging() {
  const svg = document.getElementById('gantt-svg-overlay');
  if (!svg) return;
  
  let tempLine = null;
  
  document.addEventListener('mousedown', (e) => {
    if (!e.target.classList.contains('connector-out')) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    isDrawingDependency = true;
    const bar = e.target.closest('.gantt-bar-wrapper');
    dependencyStartTaskId = parseInt(bar.dataset.taskId);
    
    const bodyRect = document.getElementById('gantt-rows-container').getBoundingClientRect();
    const outRect = e.target.getBoundingClientRect();
    
    dependencyStartNodeCoords = {
      x: outRect.left - bodyRect.left + outRect.width / 2,
      y: outRect.top - bodyRect.top + outRect.height / 2
    };
    
    tempLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempLine.setAttribute('class', 'temp-connector-line');
    tempLine.setAttribute('d', `M ${dependencyStartNodeCoords.x} ${dependencyStartNodeCoords.y} L ${dependencyStartNodeCoords.x} ${dependencyStartNodeCoords.y}`);
    svg.appendChild(tempLine);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isDrawingDependency || !tempLine) return;
    
    const bodyRect = document.getElementById('gantt-rows-container').getBoundingClientRect();
    const currentX = e.clientX - bodyRect.left;
    const currentY = e.clientY - bodyRect.top;
    
    tempLine.setAttribute('d', `M ${dependencyStartNodeCoords.x} ${dependencyStartNodeCoords.y} L ${currentX} ${currentY}`);
  });
  
  document.addEventListener('mouseup', async (e) => {
    if (!isDrawingDependency) return;
    
    if (tempLine) {
      tempLine.remove();
      tempLine = null;
    }
    
    isDrawingDependency = false;
    
    if (e.target.classList.contains('connector-in')) {
      const targetBar = e.target.closest('.gantt-bar-wrapper');
      const targetTaskId = parseInt(targetBar.dataset.taskId);
      
      if (dependencyStartTaskId === targetTaskId) {
        alert('A task cannot depend on itself.');
        return;
      }
      
      await createDependency(targetTaskId, dependencyStartTaskId);
    }
    
    dependencyStartTaskId = null;
    dependencyStartNodeCoords = null;
  });
}

// 8. Create dependency API call
async function createDependency(taskId, predecessorId) {
  try {
    const response = await fetch('/api/dependencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        predecessor_id: predecessorId
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      await fetchTasks(state.activeProjectId);
    } else {
      alert(result.message || 'Could not establish task connection.');
    }
  } catch (error) {
    console.error('Dependency create error:', error);
  }
}

// 9. Delete dependency API call
async function deleteDependency(taskId, predecessorId) {
  const predTask = state.tasks.find(t => t.id == predecessorId);
  const succTask = state.tasks.find(t => t.id == taskId);
  
  const msg = `Delete dependency relationship? \n\n"${predTask?.name}" ➔ "${succTask?.name}"`;
  if (!confirm(msg)) return;
  
  try {
    const response = await fetch('/api/dependencies', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_id: taskId,
        predecessor_id: predecessorId
      })
    });
    
    const result = await response.json();
    if (result.success) {
      await fetchTasks(state.activeProjectId);
    } else {
      alert(result.message || 'Failed to remove connection.');
    }
  } catch (error) {
    console.error('Dependency delete error:', error);
  }
}
