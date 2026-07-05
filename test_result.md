#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Apply the RoutePulse code-review corrections brief: crash robustness, backend vote security, react-query adoption, dead-UI cleanup, and backend tests."

backend:
  - task: "Enum validation for incident/post type & severity (422 on bad values)"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "IncidentType/Severity Pydantic enums on IncidentCreate & PostCreate. Covered by test_api.py::test_invalid_incident_type_is_422 and test_invalid_severity_is_422."
  - task: "Authenticated, idempotent post like/confirm with anti-double-vote tables"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "PostLikeORM/PostConfirmORM (one row per user+post). like/confirm require auth, toggle, no client delta. PostOut exposes liked_by_me/confirmed_by_me. Incidents remain anonymous by product choice. Covered by like/confirm/per-user tests."
  - task: "Backend API test suite"
    implemented: true
    working: true
    file: "backend/test_api.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "15 endpoint tests via FastAPI TestClient on an isolated SQLite db. Full backend suite: 22 passed (routing + api). black/isort/flake8/mypy all clean."

frontend:
  - task: "Crash guards on unknown incident type/severity"
    implemented: true
    working: true
    file: "frontend/src/components/routepulse/AlertPost.jsx, frontend/src/pages/MapView.jsx, frontend/src/components/routepulse/TrafficMap.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Every INCIDENT_TYPES[...] / TRAFFIC_LEVELS[...] lookup has a fallback default."
  - task: "Adopt react-query + mutation error handling"
    implemented: true
    working: true
    file: "frontend/src/context/AppDataContext.jsx, frontend/src/index.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "AppDataProvider owns a QueryClient (useQuery/useMutation); index.js no longer wraps a provider. All mutations await+try/catch in callers (Report, AlertPost, MapView, PostDetail) with error toasts. liked_by_me/confirmed_by_me are the source of truth. 18 frontend tests pass; prod build compiles."
  - task: "Dead UI wired: feed tab sorting, header search + notifications, real timestamp/impact, photo upload"
    implemented: true
    working: true
    file: "frontend/src/pages/Feed.jsx, frontend/src/pages/AppShell.jsx, frontend/src/pages/MapView.jsx, frontend/src/pages/Report.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "main"
          comment: "Feed tabs sort (hot/recent); un-implementable 'Autour' tab removed (posts have no coords). Search dialog + notifications popover backed by live data. MapView shows real relative timestamp and estimated delay. Report has a working image upload (data URL -> post image field)."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "main"
      message: "Corrections brief applied. Automated checks green: backend 22 pytest + black/isort/flake8/mypy clean; frontend 18 jest tests + production build. Manual UI smoke (dev server) still recommended for the new search/notifications/photo flows."