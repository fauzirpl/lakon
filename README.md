# 🌌 PlanFlow Advanced Gantt System

> **Forget spreadsheets. Stop fighting bloated corporate project tools. PlanFlow is a developer-centric, glassmorphic workplan designer featuring automatic scheduling cascading, resource overload sentinels, interactive comment streams, file lockers, and executive print reports.**

---

## ⚡ Key Highlights (Why PlanFlow?)

PlanFlow isn't just another checklist. It is designed to act as an active pilot for your project roadmap.

### 🔄 Recursive Schedule Whiplash (Cascade Engine)
If you delay Task A, successor Task B shouldn't stay in the past. PlanFlow's recursive schedule engine dynamically calculates downstream successor dependencies on any schedule shift. If an overlap is triggered, it automatically cascades the dates forward, logging every update in the project audit log.

### 👥 The Over-allocation Sentinel
PlanFlow monitors your team's calendar load in real-time. If you assign a collaborator to overlapping tasks on the same calendar day, their load meter highlights in **Crimson Red** with a **`⚠️ Overallocated`** warning badge, protecting your team from burnout.

### 👥 Baseline Gantt Shadowing
Set your project baseline in stone with one click. Any future modifications to active dates will render a semi-transparent, ghost-like shadow bar directly underneath the active bar, showing the schedule variance at a glance.

### 📄 Executive Print Report Compiler
Need to present to stakeholders? Press **Print** to hide the dashboard and compile a formal corporate **Project Status Report** document layout—complete with metadata cards, summary KPIs, task roadmaps with inline timeline bars, resource allocation tables, recent activity logs, and official sign-off sheets.

---

## 🎨 Database Blueprint (Entity-Relationship)

Here is how the data fits together inside MySQL:

```mermaid
erDiagram
    USERS {
        int id PK
        string username UNIQUE
        string password
        timestamp created_at
    }
    PROJECTS {
        int id PK
        int user_id FK
        string name
        text description
        date start_date
        timestamp created_at
    }
    PROJECT_MEMBERS {
        int id PK
        int project_id FK
        int user_id FK
        string role
    }
    TASKS {
        int id PK
        int project_id FK
        string name
        date start_date
        date end_date
        int progress
        string color
        int assignee_id FK
        int parent_id FK
        string type
        date baseline_start_date
        date baseline_end_date
    }
    DEPENDENCIES {
        int id PK
        int task_id FK
        int predecessor_id FK
    }
    COMMENTS {
        int id PK
        int task_id FK
        int user_id FK
        text content
        timestamp created_at
    }
    ATTACHMENTS {
        int id PK
        int task_id FK
        int user_id FK
        string filename
        string filepath
        int filesize
        timestamp created_at
    }
    AUDIT_LOGS {
        int id PK
        int project_id FK
        int user_id FK
        string action
        text details
        timestamp created_at
    }

    USERS ||--o{ PROJECTS : "owns"
    USERS ||--o{ PROJECT_MEMBERS : "member_of"
    PROJECTS ||--o{ PROJECT_MEMBERS : "has_collaborators"
    PROJECTS ||--o{ TASKS : "contains"
    TASKS ||--o{ DEPENDENCIES : "depends_on"
    TASKS ||--o{ COMMENTS : "has_discussion"
    TASKS ||--o{ ATTACHMENTS : "stores_files"
    PROJECTS ||--o{ AUDIT_LOGS : "audits_actions"
    USERS ||--o{ TASKS : "assigned_to"
```

---

## 🛠️ The Tech Stack

* **Core Engine**: Node.js + Express
* **Database Brain**: MySQL (`mysql2` connection pool)
* **Frontend Canvas**: Glassmorphic HTML5, Vanilla CSS, and native JavaScript
* **Authentication**: Express Session storage & `bcryptjs` password hashing
* **File Locker**: Disk uploads parsed via `multer`
* **Orchestration**: Docker & Compose

---

## 🚀 Speed Run Setup (Get Running in 60s)

Choose your portal: Local development or Docker container.

### Option A: The Docker Compose Way (Recommended)
Make sure Docker Desktop is running. In your project root, fire this one-liner:
```bash
docker-compose up --build -d
```
> **What just happened?** Docker compiled the Node application image, grabbed MySQL 8.0, linked their network DNS, automatically mounted and ran both database schemas (`setup.sql` and `upgrade.sql`) in sequence, and launched the server on port **`3000`** while protecting database records and uploads in local persistent volumes.

### Option B: Local Setup
1. **Prepare Database**: Run MySQL (e.g., Laragon or XAMPP) on port `3306`. Run the SQL scripts:
   ```bash
   mysql -u root -p < setup.sql
   mysql -u root -p < upgrade.sql
   ```
2. **Install modules**:
   ```bash
   npm install
   ```
3. **Set your Variables (Optional)**:
   You can export variables or configure them in your terminal session:
   * `PORT` (default `3000`)
   * `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
4. **Boot Up**:
   ```bash
   npm start
   ```
   For hot-reloading development:
   ```bash
   npm run dev
   ```

---

## 📝 CLI Controls & Operations

* **Build & Start Container**: `docker-compose up --build`
* **Stop Container (Keep Data)**: `docker-compose down`
* **Prune Volumes & Hard Reset**: `docker-compose down -v`
* **View Server Container logs**: `docker-compose logs -f app`

---

## 🌟 Interactive Features Checklist

- [x] **Secure Auth Gateway**: User registration and hashed session gates.
- [x] **Collaborator Hub**: Project owners invite other members to delegate tasks.
- [x] **Cascade Scheduling**: Succession calendar math that resolves dates downstream automatically.
- [x] **Milestones & Baselines**: Distinct milestone markers and visual schedule variance shadow bars.
- [x] **Integrated Media Locker**: Upload/download attachments (max 10MB) with auto-garbage collection on deletes.
- [x] **CSV Exports & Corporate Document Prints**: Formal status reporting with clean pagination templates.

---

*PlanFlow — Crafting beautiful timelines, managing workloads, printing reports.*
