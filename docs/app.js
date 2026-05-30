/* ==========================================
   GLOBAL APP STATE CONTAINER
   ========================================== */
const STATE = {
    currentUser: null,        // Session details { id, username, role, profile }
    activeView: "explore",    // "explore", "seeker-dash", "employer-dash"
    jobsList: [],             // Active listings retrieved from API
    activeJobDetails: null,   // Selected job inside the detail modal
    theme: "light",           // "light" or "dark"
    authTab: "login",         // "login" or "register"
    authRole: "seeker"        // "seeker" or "employer" for register
};

/* ==========================================
   VIEW ROUTER & NAVIGATION CONTROLLER
   ========================================== */
function navigateTo(viewName) {
    STATE.activeView = viewName;
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Swap active nav classes
    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.remove("active");
    });
    if (viewName === "explore") {
        document.getElementById("nav-explore").classList.add("active");
    } else if (viewName === "seeker-dash") {
        document.getElementById("nav-seeker-dash").classList.add("active");
    } else if (viewName === "employer-dash") {
        document.getElementById("nav-employer-dash").classList.add("active");
    }

    // Toggle view elements
    document.querySelectorAll(".view-section").forEach(sec => {
        sec.classList.remove("active");
    });

    if (viewName === "explore") {
        document.getElementById("explore-view").classList.add("active");
        fetchJobs(); // Fetch fresh jobs list
    } else if (viewName === "seeker-dash") {
        document.getElementById("seeker-dash-view").classList.add("active");
        syncSeekerProfileForm();
        fetchSeekerApplications();
    } else if (viewName === "employer-dash") {
        document.getElementById("employer-dash-view").classList.add("active");
        syncEmployerProfileForm();
        fetchEmployerPostings();
    }
}

// Update header UI buttons based on login sessions
function updateNavigationUI() {
    const authContainer = document.getElementById("auth-state-container");
    const seekerLink = document.getElementById("nav-seeker-dash");
    const employerLink = document.getElementById("nav-employer-dash");

    if (!authContainer) return;

    if (STATE.currentUser) {
        // Show corresponding nav dashboard links
        if (STATE.currentUser.role === "seeker") {
            seekerLink.style.display = "inline-block";
            employerLink.style.display = "none";
        } else {
            employerLink.style.display = "inline-block";
            seekerLink.style.display = "none";
        }

        // Render user tag and Sign out button
        authContainer.innerHTML = `
            <div style="display: flex; align-items: center; gap: 16px;">
                <div class="user-tag">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    <span>${STATE.currentUser.username}</span>
                    <span class="role-badge">${STATE.currentUser.role}</span>
                </div>
                <button class="btn-secondary" id="logout-btn" style="padding: 10px 18px; font-size: 13px;">Sign Out</button>
            </div>
        `;

        // Attach logout event
        document.getElementById("logout-btn").addEventListener("click", performLogout);
    } else {
        // Hide dashboards links
        seekerLink.style.display = "none";
        employerLink.style.display = "none";

        // Render standard Sign In button
        authContainer.innerHTML = `<button class="btn-primary" id="login-trigger-btn">Sign In</button>`;
        document.getElementById("login-trigger-btn").addEventListener("click", () => openAuthModal("login"));
    }
}

/* ==========================================
   AUTHENTICATION API REQUEST CONTROLLERS
   ========================================== */
async function fetchUserSession() {
    try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
            STATE.currentUser = await response.json();
        } else {
            STATE.currentUser = null;
        }
    } catch (e) {
        console.warn("Server connection failed, running in static fallback mode.");
        STATE.currentUser = null;
    }
    updateNavigationUI();
}

async function performLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        STATE.currentUser = null;
        updateNavigationUI();
        navigateTo("explore");
    } catch (e) {
        console.error("Logout request failed:", e);
    }
}

/* ==========================================
   JOB EXPLORER API CONTROLLERS & TEMPLATES
   ========================================== */
async function fetchJobs() {
    const grid = document.getElementById("explore-jobs-grid");
    const countLabel = document.getElementById("listings-count-label");
    if (!grid) return;

    // Gather query bounds
    const q = document.getElementById("search-query").value;
    const loc = document.getElementById("search-location").value;
    const type = document.getElementById("search-type").value;

    const url = `/api/jobs?query=${encodeURIComponent(q)}&location=${loc}&jobType=${type}`;

    try {
        const response = await fetch(url);
        if (response.ok) {
            STATE.jobsList = await response.json();
        }
    } catch (e) {
        console.error("Failed to load jobs from Express API:", e);
    }

    // Render Listings count label
    if (countLabel) {
        countLabel.textContent = `Showing ${STATE.jobsList.length} verified available role${STATE.jobsList.length === 1 ? '' : 's'}`;
    }

    // Render grid
    if (STATE.jobsList.length === 0) {
        grid.innerHTML = `
            <div class="empty-state animate-fade">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                <h3>No Matching Positions Found</h3>
                <p class="section-subtitle" style="margin-top: 8px;">Try adjusting your keyword terms, switching locations, or broadening the job type selectors.</p>
            </div>
        `;
    } else {
        grid.innerHTML = STATE.jobsList.map(job => {
            const reqsPills = job.requirements.slice(0, 3).map(r => `<span class="pill-req">${r}</span>`).join('');
            const isFilled = job.filled;
            return `
                <div class="job-card animate-fade" data-job-id="${job.id}">
                    <div class="card-header-row">
                        <h3 class="job-card-title">${job.title}</h3>
                        ${isFilled ? '<span class="status-badge status-filled">Filled</span>' : '<span class="status-badge status-shortlisted">Active</span>'}
                    </div>
                    <div class="job-card-company">${job.companyName}</div>
                    
                    <div class="job-card-tags">
                        <span class="pill-tag">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                            ${job.location}
                        </span>
                        <span class="pill-tag">
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
                            ${job.jobType}
                        </span>
                        <span class="pill-tag">${job.salaryRange}</span>
                    </div>

                    <div class="job-card-reqs">
                        ${reqsPills}
                    </div>

                    <div class="job-card-footer">
                        <span>Posted on: ${job.datePosted}</span>
                        <span style="font-weight: 700; color: var(--accent);">View Specs &rarr;</span>
                    </div>
                </div>
            `;
        }).join('');

        // Attach card details clicks
        grid.querySelectorAll(".job-card").forEach(card => {
            card.addEventListener("click", () => {
                const jId = card.getAttribute("data-job-id");
                openJobDetails(jId);
            });
        });
    }
}

/* ==========================================
   JOB DETAILS OVERLAY AND APPLICATIONS SUBMIT
   ========================================== */
async function openJobDetails(jobId) {
    const overlay = document.getElementById("job-details-overlay");
    const container = document.getElementById("job-details-inner");
    if (!overlay || !container) return;

    try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (response.ok) {
            STATE.activeJobDetails = await response.json();
        }
    } catch (e) {
        console.error("Failed to load job details:", e);
    }

    if (!STATE.activeJobDetails) return;

    const job = STATE.activeJobDetails;
    const reqsList = job.requirements.map(r => `<li>${r}</li>`).join('');

    // Determine Action Buttons based on User Roles
    let actionBlock = "";
    if (!STATE.currentUser) {
        actionBlock = `
            <div class="detail-sidebar-card animate-fade" style="margin-top: 24px;">
                <h4 style="margin-bottom: 8px;">Apply for Role</h4>
                <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">Sign in to your Candidate Dashboard to submit application forms.</p>
                <button class="btn-primary" id="detail-signin-btn" style="width: 100%; justify-content: center;">Sign In to Apply</button>
            </div>
        `;
    } else if (STATE.currentUser.role === "seeker") {
        actionBlock = `
            <div class="detail-sidebar-card animate-fade" style="margin-top: 24px;">
                <h4 style="margin-bottom: 12px;">Submit Application</h4>
                <form id="seeker-apply-form">
                    <div class="form-group" style="margin-bottom: 16px;">
                        <label for="seeker-cover-letter">Cover Letter / Pitch</label>
                        <textarea id="seeker-cover-letter" rows="5" required placeholder="Why are you a great fit for this position? Summarize your skills..."></textarea>
                    </div>
                    <div class="auth-error-msg" id="apply-error-display" style="margin-bottom: 12px;"></div>
                    <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Submit Profiles</button>
                </form>
            </div>
        `;
    } else {
        // Employer view listing details
        actionBlock = `
            <div class="detail-sidebar-card animate-fade" style="margin-top: 24px; border-color: var(--accent);">
                <h4 style="margin-bottom: 8px; color: var(--accent);">Recruiter Mode</h4>
                <p style="font-size: 13px; color: var(--text-secondary);">You are viewing this listing in recruiter mode. Edit details or check applicant lists from your Recruiter Panel.</p>
            </div>
        `;
    }

    container.innerHTML = `
        <span class="pill-tag" style="background-color: var(--accent-light); color: var(--accent); font-weight: 800; text-transform: uppercase; margin-bottom: 12px;">
            ${job.category}
        </span>
        <h2 class="modal-heading" style="margin-bottom: 8px; font-size: 28px; line-height: 1.2;">${job.title}</h2>
        <div class="job-card-company" style="font-size: 16px; margin-bottom: 24px;">${job.companyName}</div>

        <div class="detail-main-layout">
            <!-- Left Side: specs descriptions -->
            <div>
                <div class="detail-block">
                    <h4>About the Position</h4>
                    <p class="detail-desc-text">${job.description}</p>
                </div>
                <div class="detail-block">
                    <h4>Key Requirements</h4>
                    <ul class="detail-reqs-list">
                        ${reqsList}
                    </ul>
                </div>
            </div>

            <!-- Right Side: Sidebar company card & action forms -->
            <div>
                <div class="detail-sidebar-card">
                    <h4>Overview</h4>
                    <ul class="detail-reqs-list" style="margin-top: 8px; margin-bottom: 16px;">
                        <li style="font-size: 13px;"><strong>Type:</strong> ${job.jobType}</li>
                        <li style="font-size: 13px;"><strong>Location:</strong> ${job.location}</li>
                        <li style="font-size: 13px;"><strong>Salary Range:</strong> ${job.salaryRange}</li>
                        <li style="font-size: 13px;"><strong>Deadline:</strong> ${job.deadline}</li>
                    </ul>
                    
                    <h4 style="border-top: 1px solid var(--border); padding-top: 12px; margin-bottom: 8px;">Stellar Recruiter</h4>
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-secondary);">${job.companyName}</div>
                    <p style="font-size: 12px; color: var(--text-muted); margin-top: 6px; line-height: 1.4;">${job.companyDetails}</p>
                </div>

                ${actionBlock}
            </div>
        </div>
    `;

    // Hook up dynamic buttons inside modal
    overlay.classList.add("open");

    const detailSignIn = document.getElementById("detail-signin-btn");
    if (detailSignIn) {
        detailSignIn.addEventListener("click", () => {
            overlay.classList.remove("open");
            openAuthModal("login");
        });
    }

    const applyForm = document.getElementById("seeker-apply-form");
    if (applyForm) {
        applyForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cover = document.getElementById("seeker-cover-letter").value;
            const errDisplay = document.getElementById("apply-error-display");

            try {
                const response = await fetch(`/api/jobs/${job.id}/apply`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ coverLetter: cover })
                });

                if (response.ok) {
                    overlay.classList.remove("open");
                    navigateTo("seeker-dash");
                } else {
                    const fail = await response.json();
                    errDisplay.textContent = fail.error || "Application submission failed.";
                }
            } catch (err) {
                errDisplay.textContent = "Connection issue, please try again.";
            }
        });
    }
}

function closeJobDetails() {
    document.getElementById("job-details-overlay").classList.remove("open");
}

/* ==========================================
   CANDIDATE DASHBOARD CONTROLLERS
   ========================================== */
function syncSeekerProfileForm() {
    const contact = document.getElementById("seeker-contact");
    const skills = document.getElementById("seeker-skills");
    const exp = document.getElementById("seeker-exp");
    const skillsDisplay = document.getElementById("profile-skills-display");

    if (!STATE.currentUser || !contact) return;

    const prof = STATE.currentUser.profile || {};
    contact.value = prof.contact || "";
    skills.value = prof.skills ? prof.skills.join(', ') : "";
    exp.value = prof.experience || "";

    // Render tag displays
    if (skillsDisplay) {
        if (prof.skills && prof.skills.length > 0) {
            skillsDisplay.innerHTML = prof.skills.map(s => `<span class="pill-req">${s}</span>`).join('');
        } else {
            skillsDisplay.innerHTML = "";
        }
    }
}

async function fetchSeekerApplications() {
    const tbody = document.getElementById("seeker-applications-tbody");
    if (!tbody) return;

    try {
        const response = await fetch('/api/seeker/applications');
        if (response.ok) {
            const list = await response.json();
            
            if (list.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
                            No submitted applications found. Browse explore view and submit cover letters.
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = list.map(app => `
                    <tr>
                        <td>
                            <div style="font-weight: 700;">${app.jobTitle}</div>
                            <div style="font-size: 12px; color: var(--text-muted);">${app.location}</div>
                        </td>
                        <td style="font-weight: 600; color: var(--text-secondary);">${app.companyName}</td>
                        <td>${app.dateApplied}</td>
                        <td>
                            <span class="status-badge ${getStatusBadgeClass(app.status)}">${app.status}</span>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (e) {
        console.error("Failed to load seeker applications:", e);
    }
}

function getStatusBadgeClass(status) {
    if (status === "Pending") return "status-pending";
    if (status === "Reviewed") return "status-reviewed";
    if (status === "Shortlisted") return "status-shortlisted";
    return "status-filled";
}

/* ==========================================
   EMPLOYER DASHBOARD CONTROLLERS
   ========================================== */
function syncEmployerProfileForm() {
    const compName = document.getElementById("employer-company-name");
    const contact = document.getElementById("employer-contact");
    const desc = document.getElementById("employer-company-desc");

    if (!STATE.currentUser || !compName) return;

    const prof = STATE.currentUser.profile || {};
    compName.value = prof.companyName || "";
    contact.value = prof.contact || "";
    desc.value = prof.companyDetails || "";
}

async function fetchEmployerPostings() {
    const tbody = document.getElementById("employer-postings-tbody");
    if (!tbody) return;

    try {
        // Fetch all jobs, then filter by employerId locally
        const response = await fetch('/api/jobs');
        if (response.ok) {
            const allJobs = await response.json();
            const myJobs = allJobs.filter(j => j.employerId === STATE.currentUser.id);

            if (myJobs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px 0;">
                            You haven't posted any jobs yet. Click 'Create New Post' to publish.
                        </td>
                    </tr>
                `;
            } else {
                tbody.innerHTML = myJobs.map(job => `
                    <tr class="posting-row animate-fade">
                        <td>
                            <div style="font-weight: 700; font-size: 15px;">${job.title}</div>
                            <div style="font-size: 12px; color: var(--text-muted);">${job.location} | ${job.jobType} | ${job.salaryRange}</div>
                        </td>
                        <td>${job.datePosted}</td>
                        <td>${job.deadline}</td>
                        <td>
                            ${job.filled 
                                ? '<span class="status-badge status-filled">Closed</span>' 
                                : '<span class="status-badge status-shortlisted">Active (Open)</span>'}
                        </td>
                        <td>
                            <div style="display: flex; gap: 8px;">
                                <button class="btn-secondary view-candidates-btn" data-job-id="${job.id}" data-job-title="${job.title}" style="padding: 6px 12px; font-size: 12px; border-color: var(--accent); color: var(--accent);">
                                    Candidates
                                </button>
                                <button class="btn-secondary edit-job-btn" data-job-id="${job.id}" style="padding: 6px 12px; font-size: 12px;">
                                    Edit
                                </button>
                                <button class="btn-secondary delete-job-btn" data-job-id="${job.id}" style="padding: 6px 12px; font-size: 12px; border-color: var(--danger); color: var(--danger);">
                                    Delete
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');

                // Hook up recruiter controls
                tbody.querySelectorAll(".view-candidates-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const jId = btn.getAttribute("data-job-id");
                        const title = btn.getAttribute("data-job-title");
                        openCandidatesModal(jId, title);
                    });
                });

                tbody.querySelectorAll(".edit-job-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const jId = btn.getAttribute("data-job-id");
                        openJobFormModal(jId);
                    });
                });

                tbody.querySelectorAll(".delete-job-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const jId = btn.getAttribute("data-job-id");
                        confirmDeleteJobListing(jId);
                    });
                });
            }
        }
    } catch (e) {
        console.error("Failed to load recruiter postings:", e);
    }
}

/* ==========================================
   RECRUITER ACTION FORM OVERLAYS
   ========================================== */
function openJobFormModal(jobId = null) {
    const overlay = document.getElementById("job-form-overlay");
    const heading = document.getElementById("job-form-title");
    const form = document.getElementById("employer-job-form");
    const filledGroup = document.getElementById("job-form-filled-group");

    if (!overlay || !form) return;

    // Reset Form
    form.reset();
    document.getElementById("job-form-id").value = "";
    document.getElementById("job-form-error-display").textContent = "";

    if (jobId) {
        heading.textContent = "Edit Job Posting";
        filledGroup.style.display = "block";
        
        // Find existing specs
        const job = STATE.jobsList.find(j => j.id === jobId);
        if (job) {
            document.getElementById("job-form-id").value = job.id;
            document.getElementById("job-form-title-input").value = job.title;
            document.getElementById("job-form-type").value = job.jobType;
            document.getElementById("job-form-location").value = job.location;
            document.getElementById("job-form-salary").value = job.salaryRange;
            document.getElementById("job-form-deadline").value = job.deadline;
            document.getElementById("job-form-filled").value = job.filled ? "true" : "false";
            document.getElementById("job-form-reqs").value = job.requirements.join(', ');
            document.getElementById("job-form-desc").value = job.description;
        }
    } else {
        heading.textContent = "Create Job Posting";
        filledGroup.style.display = "none";
    }

    overlay.classList.add("open");
}

function closeJobFormModal() {
    document.getElementById("job-form-overlay").classList.remove("open");
}

async function confirmDeleteJobListing(jobId) {
    if (confirm("Are you sure you want to permanently delete this job listing? All incoming candidate profiles will be lost.")) {
        try {
            const response = await fetch(`/api/jobs/${jobId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                fetchEmployerPostings();
            } else {
                alert("Authorization denied, could not delete job.");
            }
        } catch (e) {
            alert("Connection error, deletion failed.");
        }
    }
}

/* ==========================================
   RECRUITER CANDIDATE EVALUATION DRAWER
   ========================================== */
async function openCandidatesModal(jobId, jobTitle) {
    const overlay = document.getElementById("applicants-overlay");
    const titleLabel = document.getElementById("applicants-job-title");
    const container = document.getElementById("recruiter-applicants-container");

    if (!overlay || !container) return;

    titleLabel.textContent = `Candidates: ${jobTitle}`;
    container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px 0;">Loading profiles...</div>`;
    overlay.classList.add("open");

    try {
        const response = await fetch(`/api/employer/applications/${jobId}`);
        if (response.ok) {
            const list = await response.json();
            
            if (list.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; color: var(--text-muted); padding: 32px 0;">
                        No candidates have applied to this role yet. We will notify you when applications arrive.
                    </div>
                `;
            } else {
                container.innerHTML = list.map(app => {
                    const skillsPills = app.candidateSkills.map(s => `<span class="pill-req">${s}</span>`).join('');
                    return `
                        <div class="applicant-card animate-fade">
                            <div class="applicant-header">
                                <div>
                                    <div class="applicant-name">${app.candidateName}</div>
                                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">Contact: ${app.candidateContact || "No contact info provided"}</div>
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <label style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">Milestone:</label>
                                    <select class="status-select" data-app-id="${app.id}" style="padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); font-size: 13px; font-weight: 700; background-color: var(--bg-secondary);">
                                        <option value="Pending" ${app.status === "Pending" ? "selected" : ""}>Pending</option>
                                        <option value="Reviewed" ${app.status === "Reviewed" ? "selected" : ""}>Reviewed</option>
                                        <option value="Shortlisted" ${app.status === "Shortlisted" ? "selected" : ""}>Shortlist</option>
                                        <option value="Filled" ${app.status === "Filled" ? "selected" : ""}>Hire (Fill)</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="applicant-body">
                                <div>
                                    <strong style="font-size: 13px; display: block; margin-bottom: 6px;">Skills Profile:</strong>
                                    <div class="skills-tags-display">${skillsPills || "None Listed"}</div>
                                </div>
                                <div>
                                    <strong style="font-size: 13px; display: block; margin-bottom: 4px;">Summary & Experience:</strong>
                                    <p style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; white-space: pre-wrap;">${app.candidateExperience || "No experience summary provided."}</p>
                                </div>
                                <div style="border-top: 1px dashed var(--border); padding-top: 12px;">
                                    <strong style="font-size: 13px; display: block; margin-bottom: 4px; color: var(--accent);">Applicant Cover Pitch:</strong>
                                    <p style="font-size: 13px; color: var(--text-secondary); font-style: italic; line-height: 1.5;">"${app.coverLetter || "No pitch provided."}"</p>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                // Hook up candidate status changes
                container.querySelectorAll(".status-select").forEach(select => {
                    select.addEventListener("change", async (e) => {
                        const appId = select.getAttribute("data-app-id");
                        const nextStatus = e.target.value;

                        try {
                            const res = await fetch(`/api/employer/applications/${appId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: nextStatus })
                            });

                            if (res.ok) {
                                // Status changed, flash visual indicator if needed
                                console.log("Candidate status updated successfully.");
                            } else {
                                alert("Failed to update candidate status.");
                            }
                        } catch (err) {
                            alert("Connection issue, status update failed.");
                        }
                    });
                });
            }
        }
    } catch (e) {
        container.innerHTML = `<div style="text-align: center; color: var(--danger); padding: 16px 0;">Failed to load candidate profiles.</div>`;
    }
}

/* ==========================================
   AUTHENTICATION SLIDING DRAWER CONTROLLER
   ========================================== */
function openAuthModal(tabName = "login") {
    const overlay = document.getElementById("auth-overlay");
    const roleSelector = document.getElementById("role-selector-wrapper");
    const loginBtn = document.getElementById("auth-tab-login");
    const registerBtn = document.getElementById("auth-tab-register");
    const submitBtn = document.getElementById("auth-submit-btn");

    if (!overlay) return;

    STATE.authTab = tabName;
    document.getElementById("auth-credentials-form").reset();
    document.getElementById("auth-error-display").textContent = "";

    // Toggle Tab visuals
    if (tabName === "login") {
        loginBtn.classList.add("active");
        registerBtn.classList.remove("active");
        roleSelector.style.display = "none";
        submitBtn.textContent = "Sign In";
    } else {
        registerBtn.classList.add("active");
        loginBtn.classList.remove("active");
        roleSelector.style.display = "block";
        submitBtn.textContent = "Create Account";
    }

    overlay.classList.add("open");
}

function closeAuthModal() {
    document.getElementById("auth-overlay").classList.remove("open");
}

/* ==========================================
   SYSTEM INITIALIZATION & EVENT LISTENERS
   ========================================== */
document.addEventListener("DOMContentLoaded", async () => {
    // 1. Load active session configurations
    await fetchUserSession();

    // 2. Fetch fresh job listings on boot
    fetchJobs();

    // 3. Header and Navigation clicks
    document.getElementById("nav-logo").addEventListener("click", () => navigateTo("explore"));
    document.getElementById("nav-explore").addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("explore");
    });
    document.getElementById("nav-seeker-dash").addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("seeker-dash");
    });
    document.getElementById("nav-employer-dash").addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("employer-dash");
    });

    document.getElementById("footer-explore-link").addEventListener("click", (e) => {
        e.preventDefault();
        navigateTo("explore");
    });

    // 4. Search Filter Actions
    document.getElementById("search-submit-btn").addEventListener("click", fetchJobs);
    document.getElementById("search-query").addEventListener("keypress", (e) => {
        if (e.key === "Enter") fetchJobs();
    });

    // 5. Auth Modal Tab Toggles
    document.getElementById("auth-tab-login").addEventListener("click", () => openAuthModal("login"));
    document.getElementById("auth-tab-register").addEventListener("click", () => openAuthModal("register"));
    document.getElementById("auth-modal-close").addEventListener("click", closeAuthModal);
    
    // Auth Modal Overlay clicks
    const authOverlay = document.getElementById("auth-overlay");
    authOverlay.addEventListener("click", (e) => {
        if (e.target === authOverlay) closeAuthModal();
    });

    // Registration Role buttons clicks
    document.querySelectorAll(".role-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            STATE.authRole = btn.getAttribute("data-role");
        });
    });

    // Auth Form submissions (Dynamic Register / Login API handler)
    document.getElementById("auth-credentials-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const user = document.getElementById("auth-username").value;
        const pass = document.getElementById("auth-password").value;
        const errDisplay = document.getElementById("auth-error-display");

        const url = STATE.authTab === "login" ? '/api/auth/login' : '/api/auth/register';
        const body = STATE.authTab === "login" 
            ? { username: user, password: pass }
            : { username: user, password: pass, role: STATE.authRole };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                STATE.currentUser = await response.json();
                closeAuthModal();
                updateNavigationUI();
                
                // Route automatically to their dashboard
                if (STATE.currentUser.role === "seeker") {
                    navigateTo("seeker-dash");
                } else {
                    navigateTo("employer-dash");
                }
            } else {
                const fail = await response.json();
                errDisplay.textContent = fail.error || "Authentication failed.";
            }
        } catch (err) {
            errDisplay.textContent = "Server down, please try again later.";
        }
    });

    // 6. Close details clicks
    document.getElementById("job-details-close").addEventListener("click", closeJobDetails);
    const detailsOverlay = document.getElementById("job-details-overlay");
    detailsOverlay.addEventListener("click", (e) => {
        if (e.target === detailsOverlay) closeJobDetails();
    });

    // 7. Seeker Profile Form submissions
    const seekerProfileForm = document.getElementById("seeker-profile-form");
    if (seekerProfileForm) {
        seekerProfileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const contact = document.getElementById("seeker-contact").value;
            const skillsVal = document.getElementById("seeker-skills").value;
            const exp = document.getElementById("seeker-exp").value;

            // Split skills by commas and trim whitespace
            const skillsList = skillsVal.split(',').map(s => s.trim()).filter(s => s.length > 0);

            try {
                const response = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contact, skills: skillsList, experience: exp })
                });

                if (response.ok) {
                    STATE.currentUser = await response.json();
                    syncSeekerProfileForm();
                    alert("Developer profile successfully updated!");
                } else {
                    alert("Profile update failed.");
                }
            } catch (err) {
                alert("Connection failed.");
            }
        });
    }

    // 8. Employer Profile Form submissions
    const employerProfileForm = document.getElementById("employer-profile-form");
    if (employerProfileForm) {
        employerProfileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const compName = document.getElementById("employer-company-name").value;
            const contact = document.getElementById("employer-contact").value;
            const desc = document.getElementById("employer-company-desc").value;

            try {
                const response = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyName: compName, contact, companyDetails: desc })
                });

                if (response.ok) {
                    STATE.currentUser = await response.json();
                    syncEmployerProfileForm();
                    alert("Company info successfully saved!");
                } else {
                    alert("Recruiter update failed.");
                }
            } catch (err) {
                alert("Connection failed.");
            }
        });
    }

    // 9. Employer Job postings forms actions
    document.getElementById("employer-post-job-trigger").addEventListener("click", () => openJobFormModal(null));
    document.getElementById("job-form-close").addEventListener("click", closeJobFormModal);
    document.getElementById("job-form-cancel").addEventListener("click", closeJobFormModal);
    const formOverlay = document.getElementById("job-form-overlay");
    formOverlay.addEventListener("click", (e) => {
        if (e.target === formOverlay) closeJobFormModal();
    });

    document.getElementById("employer-job-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        
        const jobId = document.getElementById("job-form-id").value;
        const title = document.getElementById("job-form-title-input").value;
        const type = document.getElementById("job-form-type").value;
        const location = document.getElementById("job-form-location").value;
        const salary = document.getElementById("job-form-salary").value;
        const deadline = document.getElementById("job-form-deadline").value;
        const reqsVal = document.getElementById("job-form-reqs").value;
        const desc = document.getElementById("job-form-desc").value;
        const filled = document.getElementById("job-form-filled").value === "true";
        const errDisplay = document.getElementById("job-form-error-display");

        const reqsList = reqsVal.split(',').map(r => r.trim()).filter(r => r.length > 0);

        const body = {
            title,
            jobType: type,
            location,
            salaryRange: salary,
            deadline,
            requirements: reqsList,
            description: desc,
            category: "engineering", // Default tag category
            filled
        };

        const url = jobId ? `/api/jobs/${jobId}` : '/api/jobs';
        const method = jobId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (response.ok) {
                closeJobFormModal();
                fetchEmployerPostings();
            } else {
                const fail = await response.json();
                errDisplay.textContent = fail.error || "Failed to publish listing.";
            }
        } catch (err) {
            errDisplay.textContent = "Connection issue, publishing failed.";
        }
    });

    // 10. Employer Candidates Review overlay closing actions
    document.getElementById("applicants-close").addEventListener("click", () => {
        document.getElementById("applicants-overlay").classList.remove("open");
        fetchEmployerPostings(); // Reload listings to show if any state changed
    });
    const appsOverlay = document.getElementById("applicants-overlay");
    appsOverlay.addEventListener("click", (e) => {
        if (e.target === appsOverlay) {
            appsOverlay.classList.remove("open");
            fetchEmployerPostings();
        }
    });

    // 11. Theme Switcher Event
    // Load preference
    const savedTheme = localStorage.getItem("talenthub_theme") || "light";
    STATE.theme = savedTheme;
    document.documentElement.setAttribute("data-theme", savedTheme);

    document.getElementById("theme-toggle").addEventListener("click", () => {
        const nextTheme = STATE.theme === "light" ? "dark" : "light";
        STATE.theme = nextTheme;
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("talenthub_theme", nextTheme);
    });
});
