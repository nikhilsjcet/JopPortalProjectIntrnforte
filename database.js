const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'database.json');

// SHA-256 secure password hashing wrapper
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Database state container
const DB = {
    users: [],        // { id, username, passwordHash, role, profile: { contact, skills: [], experience, companyName, companyDetails } }
    jobs: [],         // { id, employerId, title, description, requirements: [], location, jobType, salaryRange, deadline, filled, datePosted }
    applications: []  // { id, jobId, seekerId, dateApplied, status, coverLetter }
};

// Initialize file database on boot
function initDatabase() {
    if (!fs.existsSync(DB_PATH)) {
        saveDatabase();
        console.log("Database initialized successfully at database.json");
    } else {
        loadDatabase();
        console.log("Loaded existing records from database.json");
    }
}

// Load from JSON file
function loadDatabase() {
    try {
        const data = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(data);
        DB.users = parsed.users || [];
        DB.jobs = parsed.jobs || [];
        DB.applications = parsed.applications || [];
    } catch (e) {
        console.error("Could not parse database.json, starting fresh:", e);
    }
}

// Save atomic transaction back to file
function saveDatabase() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(DB, null, 2), 'utf8');
    } catch (e) {
        console.error("Failed to commit database updates to database.json:", e);
    }
}

/* ==========================================
   USER AUTHENTICATION CONTROLLER METHODS
   ========================================== */
const Users = {
    findByUsername: (username) => {
        loadDatabase();
        return DB.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    },
    
    findById: (id) => {
        loadDatabase();
        return DB.users.find(u => u.id === id);
    },

    register: (username, password, role) => {
        loadDatabase();
        if (Users.findByUsername(username)) {
            return null; // Username already taken
        }

        const newUser = {
            id: 'usr_' + Math.random().toString(36).substr(2, 9),
            username,
            passwordHash: hashPassword(password),
            role: role === 'employer' ? 'employer' : 'seeker',
            profile: role === 'employer' 
                ? { companyName: "", companyDetails: "", contact: "" }
                : { contact: "", skills: [], experience: "" }
        };

        DB.users.push(newUser);
        saveDatabase();
        return newUser;
    },

    verify: (username, password) => {
        loadDatabase();
        const user = Users.findByUsername(username);
        if (!user) return null;
        
        const hash = hashPassword(password);
        if (user.passwordHash === hash) {
            return user;
        }
        return null;
    },

    updateProfile: (userId, profileData) => {
        loadDatabase();
        const user = DB.users.find(u => u.id === userId);
        if (!user) return false;

        user.profile = { ...user.profile, ...profileData };
        saveDatabase();
        return true;
    }
};

/* ==========================================
   JOB LISTINGS CRUD METHODS
   ========================================== */
const Jobs = {
    all: () => {
        loadDatabase();
        return DB.jobs;
    },

    findById: (id) => {
        loadDatabase();
        return DB.jobs.find(j => j.id === id);
    },

    create: (employerId, jobData) => {
        loadDatabase();
        const newJob = {
            id: 'job_' + Math.random().toString(36).substr(2, 9),
            employerId,
            title: jobData.title || "Untitled Position",
            description: jobData.description || "",
            requirements: Array.isArray(jobData.requirements) ? jobData.requirements : [],
            location: jobData.location || "Remote",
            jobType: jobData.jobType || "Full-time",
            salaryRange: jobData.salaryRange || "Not Specified",
            deadline: jobData.deadline || "Open",
            filled: false,
            datePosted: new Date().toISOString().split('T')[0]
        };

        DB.jobs.push(newJob);
        saveDatabase();
        return newJob;
    },

    update: (jobId, employerId, jobData) => {
        loadDatabase();
        const job = DB.jobs.find(j => j.id === jobId && j.employerId === employerId);
        if (!job) return null;

        job.title = jobData.title || job.title;
        job.description = jobData.description || job.description;
        job.requirements = Array.isArray(jobData.requirements) ? jobData.requirements : job.requirements;
        job.location = jobData.location || job.location;
        job.jobType = jobData.jobType || job.jobType;
        job.salaryRange = jobData.salaryRange || job.salaryRange;
        job.deadline = jobData.deadline || job.deadline;
        
        if (jobData.filled !== undefined) {
            job.filled = jobData.filled;
        }

        saveDatabase();
        return job;
    },

    delete: (jobId, employerId) => {
        loadDatabase();
        const initialLen = DB.jobs.length;
        DB.jobs = DB.jobs.filter(j => !(j.id === jobId && j.employerId === employerId));
        
        if (DB.jobs.length !== initialLen) {
            // Also clean up any applications for this deleted job
            DB.applications = DB.applications.filter(a => a.jobId !== jobId);
            saveDatabase();
            return true;
        }
        return false;
    }
};

/* ==========================================
   JOB APPLICATION ENGINE METHODS
   ========================================== */
const Applications = {
    apply: (seekerId, jobId, coverLetter) => {
        loadDatabase();
        
        // Prevent double applications
        const alreadyApplied = DB.applications.find(a => a.seekerId === seekerId && a.jobId === jobId);
        if (alreadyApplied) return null;

        const job = Jobs.findById(jobId);
        if (!job || job.filled) return null;

        const newApp = {
            id: 'app_' + Math.random().toString(36).substr(2, 9),
            jobId,
            seekerId,
            coverLetter: coverLetter || "",
            dateApplied: new Date().toISOString().split('T')[0],
            status: "Pending" // "Pending", "Reviewed", "Shortlisted", "Filled"
        };

        DB.applications.push(newApp);
        saveDatabase();
        return newApp;
    },

    findBySeeker: (seekerId) => {
        loadDatabase();
        return DB.applications.filter(a => a.seekerId === seekerId);
    },

    findByJob: (jobId, employerId) => {
        loadDatabase();
        // Check ownership of the job listing
        const job = DB.jobs.find(j => j.id === jobId && j.employerId === employerId);
        if (!job) return [];
        return DB.applications.filter(a => a.jobId === jobId);
    },

    updateStatus: (appId, employerId, nextStatus) => {
        loadDatabase();
        const app = DB.applications.find(a => a.id === appId);
        if (!app) return false;

        // Ensure current employer owns the corresponding job listing
        const job = DB.jobs.find(j => j.id === app.jobId && j.employerId === employerId);
        if (!job) return false;

        const validStatuses = ["Pending", "Reviewed", "Shortlisted", "Filled"];
        if (validStatuses.includes(nextStatus)) {
            app.status = nextStatus;
            saveDatabase();
            return true;
        }
        return false;
    }
};

module.exports = {
    initDatabase,
    Users,
    Jobs,
    Applications
};
