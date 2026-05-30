const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. Core Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'docs')));

// 2. Initialize Database
db.initDatabase();

// Seed mock data if database is empty on boot
function seedDatabase() {
    const jobs = db.Jobs.all();
    if (jobs.length === 0) {
        console.log("Seeding mock job portal data...");
        // Register mock employer
        const employer = db.Users.register("stellar_corp", "stellar123", "employer");
        if (employer) {
            db.Users.updateProfile(employer.id, {
                companyName: "Stellar Systems Co.",
                companyDetails: "Stellar Systems is a premier systems engineering and web engineering collective focusing on distributed databases and high-performance frontend interfaces.",
                contact: "careers@stellar.co"
            });

            // Post 3 mock jobs
            db.Jobs.create(employer.id, {
                title: "Senior Rust Systems Architect",
                description: "We are seeking a senior systems software architect to build out high-performance database middleware frameworks. You will leverage Axum, Tokio, and lock-free thread structures to engineer distributed log networks.",
                requirements: ["5+ Years systems engineering experience", "Proficiency in Rust, Tokio, and Cargo dependencies", "Familiarity with SQLite, relational engines, and TCP streams", "Degree in Computer Science or equivalent practical exposure"],
                location: "Bengaluru (Hybrid)",
                jobType: "Full-time",
                salaryRange: "₹24,00,000 - ₹36,00,000 PA",
                deadline: "2026-07-15"
            });

            db.Jobs.create(employer.id, {
                title: "UI/UX Full-Stack Engineer",
                description: "Join our core UI experience group to engineer gorgeous, micro-interaction-driven web clients. You will build clean glassmorphic components, fluid CSS transition layers, and reactive vanilla JS states connected to Node APIs.",
                requirements: ["3+ Years frontend or fullstack experience", "Deep knowledge of HTML5, CSS Variables, and responsive Flex/Grid rules", "Experience with Node.js, Express, and REST API payload integrations", "Strong aesthetic eye for sleek, harmonization dark/light modes"],
                location: "Remote",
                jobType: "Remote",
                salaryRange: "₹12,00,000 - ₹18,00,000 PA",
                deadline: "2026-06-30"
            });

            db.Jobs.create(employer.id, {
                title: "Marketing & Community Operations Manager",
                description: "Help scale our open-source developer hub! You will lead community outreach, design premium branding materials, coordinate technical blog releases, and represent the brand at national systems engineering meetups.",
                requirements: ["2+ Years technical product marketing or community management", "Familiarity with open-source communities and GitHub workflow systems", "Excellent descriptive copy writing and presentation layouts", "Basic HTML/CSS editing to tweak landing frameworks"],
                location: "New Delhi (On-site)",
                jobType: "Full-time",
                salaryRange: "₹8,00,000 - ₹11,00,000 PA",
                deadline: "2026-08-01"
            });
            console.log("Mock job portal database seeded successfully.");
        }
    }
}
seedDatabase();

/* ==========================================
   AUTHENTICATION SESSION MIDDLEWARE
   ========================================== */
function authenticateUser(req, res, next) {
    const userId = req.cookies.session_user;
    if (!userId) {
        req.user = null;
        return next();
    }

    const user = db.Users.findById(userId);
    if (!user) {
        // Clear invalid cookie
        res.clearCookie('session_user');
        req.user = null;
        return next();
    }

    req.user = user;
    next();
}

function requireAuth(req, res, next) {
    authenticateUser(req, res, () => {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication Required" });
        }
        next();
    });
}

function requireRole(role) {
    return (req, res, next) => {
        requireAuth(req, res, () => {
            if (req.user.role !== role) {
                return res.status(403).json({ error: "Access Denied: Insufficient Permissions" });
            }
            next();
        });
    };
}

/* ==========================================
   AUTHENTICATION ROUTES
   ========================================== */
app.post('/api/auth/register', (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: "Missing required registration parameters" });
    }
    if (username.length < 3 || password.length < 6) {
        return res.status(400).json({ error: "Username (min 3 chars) or Password (min 6 chars) too short" });
    }

    const newUser = db.Users.register(username, password, role);
    if (!newUser) {
        return res.status(409).json({ error: "Username is already taken" });
    }

    // Set cookie immediately upon registration
    res.cookie('session_user', newUser.id, { maxAge: 86400000, httpOnly: true });
    
    // Return user info excluding secure hash
    const { passwordHash, ...userResponse } = newUser;
    res.status(201).json(userResponse);
});

app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Missing username or password credentials" });
    }

    const verified = db.Users.verify(username, password);
    if (!verified) {
        return res.status(401).json({ error: "Invalid username or password credentials" });
    }

    res.cookie('session_user', verified.id, { maxAge: 86400000, httpOnly: true });
    
    const { passwordHash, ...userResponse } = verified;
    res.status(200).json(userResponse);
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('session_user');
    res.status(200).json({ message: "Successfully logged out" });
});

app.get('/api/auth/me', authenticateUser, (req, res) => {
    if (!req.user) {
        return res.status(200).json(null);
    }
    const { passwordHash, ...userResponse } = req.user;
    res.status(200).json(userResponse);
});

/* ==========================================
   USER PROFILE ROUTES
   ========================================== */
app.put('/api/profile', requireAuth, (req, res) => {
    const updated = db.Users.updateProfile(req.user.id, req.body);
    if (updated) {
        const freshUser = db.Users.findById(req.user.id);
        const { passwordHash, ...userResponse } = freshUser;
        return res.status(200).json(userResponse);
    }
    res.status(500).json({ error: "Failed to update profile statistics" });
});

/* ==========================================
   JOB LISTINGS CRUD ROUTES
   ========================================== */
app.get('/api/jobs', (req, res) => {
    const { query, location, jobType } = req.query;
    let list = db.Jobs.all();

    // Filter dynamic criteria
    if (query && query.trim() !== "") {
        const q = query.toLowerCase();
        list = list.filter(j => 
            j.title.toLowerCase().includes(q) || 
            j.description.toLowerCase().includes(q) ||
            j.requirements.some(r => r.toLowerCase().includes(q))
        );
    }

    if (location && location !== "all") {
        const loc = location.toLowerCase();
        list = list.filter(j => j.location.toLowerCase().includes(loc));
    }

    if (jobType && jobType !== "all") {
        list = list.filter(j => j.jobType.toLowerCase() === jobType.toLowerCase());
    }

    // Embed Employer profile parameters for easy client consumption
    const enriched = list.map(job => {
        const employer = db.Users.findById(job.employerId);
        return {
            ...job,
            companyName: employer?.profile?.companyName || "Independent Employer",
            companyContact: employer?.profile?.contact || ""
        };
    });

    res.status(200).json(enriched);
});

app.get('/api/jobs/:id', (req, res) => {
    const job = db.Jobs.findById(req.params.id);
    if (!job) {
        return res.status(404).json({ error: "Job Listing Not Found" });
    }

    const employer = db.Users.findById(job.employerId);
    res.status(200).json({
        ...job,
        companyName: employer?.profile?.companyName || "Independent Employer",
        companyDetails: employer?.profile?.companyDetails || "No further company details provided.",
        companyContact: employer?.profile?.contact || ""
    });
});

app.post('/api/jobs', requireRole('employer'), (req, res) => {
    const newJob = db.Jobs.create(req.user.id, req.body);
    res.status(201).json(newJob);
});

app.put('/api/jobs/:id', requireRole('employer'), (req, res) => {
    const updated = db.Jobs.update(req.params.id, req.user.id, req.body);
    if (!updated) {
        return res.status(403).json({ error: "Forbidden: Job record not found or write authorization denied" });
    }
    res.status(200).json(updated);
});

app.delete('/api/jobs/:id', requireRole('employer'), (req, res) => {
    const deleted = db.Jobs.delete(req.params.id, req.user.id);
    if (deleted) {
        return res.status(200).json({ message: "Job listing successfully deleted" });
    }
    res.status(403).json({ error: "Forbidden: Job record not found or deletion authorization denied" });
});

/* ==========================================
   CANDIDATE APPLICATIONS PORTAL ROUTES
   ========================================== */
app.post('/api/jobs/:id/apply', requireRole('seeker'), (req, res) => {
    const { coverLetter } = req.body;
    const application = db.Applications.apply(req.user.id, req.params.id, coverLetter);
    if (!application) {
        return res.status(400).json({ error: "Application failed. Job may be filled, deleted, or you have already applied." });
    }
    res.status(201).json(application);
});

app.get('/api/seeker/applications', requireRole('seeker'), (req, res) => {
    const list = db.Applications.findBySeeker(req.user.id);
    
    // Enrich with job specs
    const enriched = list.map(app => {
        const job = db.Jobs.findById(app.jobId);
        const employer = job ? db.Users.findById(job.employerId) : null;
        return {
            ...app,
            jobTitle: job ? job.title : "Deleted Position",
            location: job ? job.location : "",
            companyName: employer?.profile?.companyName || "Deleted Company",
            jobFilled: job ? job.filled : true
        };
    });

    res.status(200).json(enriched);
});

app.get('/api/employer/applications/:jobId', requireRole('employer'), (req, res) => {
    const list = db.Applications.findByJob(req.params.jobId, req.user.id);
    
    // Enrich with candidate details
    const enriched = list.map(app => {
        const seeker = db.Users.findById(app.seekerId);
        return {
            ...app,
            candidateName: seeker ? seeker.username : "Deleted Candidate",
            candidateSkills: seeker?.profile?.skills || [],
            candidateExperience: seeker?.profile?.experience || "Not Provided",
            candidateContact: seeker?.profile?.contact || ""
        };
    });

    res.status(200).json(enriched);
});

app.put('/api/employer/applications/:appId', requireRole('employer'), (req, res) => {
    const { status } = req.body;
    const success = db.Applications.updateStatus(req.params.appId, req.user.id, status);
    if (success) {
        return res.status(200).json({ message: "Candidate application status successfully updated" });
    }
    res.status(403).json({ error: "Forbidden: Application not found or write authorization denied" });
});

// Serve frontend SPA fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'docs', 'index.html'));
});

// Boot listening socket
app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`TalentHub System Server successfully initialized.`);
    console.log(`Asynchronous Express portal online: http://localhost:${PORT}`);
    console.log(`====================================================`);
});
