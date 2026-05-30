const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const mongoose = require('mongoose');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;

// 1. Core Middlewares
app.use(express.json());
app.use(cookieParser());

// Custom CORS Middleware for secure cross-origin database requests between Pages and Render
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1') || origin.endsWith('github.io'))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie');
    
    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.static(path.join(__dirname, 'docs')));

// 2. Establish MongoDB Database Connection dynamically with Hybrid Resilient Fallback
setTimeout(async () => {
    if (db.isMocked) {
        console.log(`====================================================`);
        console.log(`[TalentHub DB] Zero-Dependency RESILIENT FALLBACK Active.`);
        console.log(`               Using local database.json storage.`);
        console.log(`====================================================`);
    } else {
        const MONGODB_URI = db.connectionString || 'mongodb://127.0.0.1:27017/talenthub';
        console.log(`Connecting to MongoDB at: ${MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@')}`);
        
        mongoose.connect(MONGODB_URI)
            .then(() => {
                console.log("Successfully connected to MongoDB server.");
                seedDatabase(); // Seed mock data asynchronously on boot if empty
            })
            .catch(err => {
                console.error("MongoDB connection failed! Please ensure MongoDB is running or configure MONGODB_URI.", err);
                db.switchToMockFallback(); // Auto-heal: Switch back to local JSON fallback dynamically
            });
    }
}, 500);

// Asynchronous seeding database routine
async function seedDatabase() {
    try {
        const count = await db.Job.countDocuments();
        if (count === 0) {
            console.log("MongoDB collections are empty. Seeding mock job listings data...");
            
            // Create Mock Employer Account if absent
            let employer = await db.User.findOne({ username: "stellar_corp" });
            if (!employer) {
                employer = new db.User({
                    username: "stellar_corp",
                    passwordHash: db.hashPassword("stellar123"),
                    role: "employer",
                    profile: {
                        companyName: "Stellar Systems Co.",
                        companyDetails: "Stellar Systems is a premier systems engineering and web engineering collective focusing on distributed databases and high-performance frontend interfaces.",
                        contact: "careers@stellar.co"
                    }
                });
                await employer.save();
            }

            // Post 3 mock jobs in Rupee formatting
            await new db.Job({
                employerId: employer._id,
                title: "Senior Rust Systems Architect",
                description: "We are seeking a senior systems software architect to build out high-performance database middleware frameworks. You will leverage Axum, Tokio, and lock-free thread structures to engineer distributed log networks.",
                requirements: ["5+ Years systems engineering experience", "Proficiency in Rust, Tokio, and Cargo dependencies", "Familiarity with SQLite, relational engines, and TCP streams", "Degree in Computer Science or equivalent practical exposure"],
                location: "Bengaluru (Hybrid)",
                jobType: "Full-time",
                salaryRange: "₹24,00,000 - ₹36,00,000 PA",
                deadline: "2026-07-15",
                datePosted: new Date().toISOString().split('T')[0]
            }).save();

            await new db.Job({
                employerId: employer._id,
                title: "UI/UX Full-Stack Engineer",
                description: "Join our core UI experience group to engineer gorgeous, micro-interaction-driven web clients. You will build clean glassmorphic components, fluid CSS transition layers, and reactive vanilla JS states connected to Node APIs.",
                requirements: ["3+ Years frontend or fullstack experience", "Deep knowledge of HTML5, CSS Variables, and responsive Flex/Grid rules", "Experience with Node.js, Express, and REST API payload integrations", "Strong aesthetic eye for sleek, harmonization dark/light modes"],
                location: "Remote",
                jobType: "Remote",
                salaryRange: "₹12,00,000 - ₹18,00,000 PA",
                deadline: "2026-06-30",
                datePosted: new Date().toISOString().split('T')[0]
            }).save();

            await new db.Job({
                employerId: employer._id,
                title: "Marketing & Community Operations Manager",
                description: "Help scale our open-source developer hub! You will lead community outreach, design premium branding materials, coordinate technical blog releases, and represent the brand at national systems engineering meetups.",
                requirements: ["2+ Years technical product marketing or community management", "Familiarity with open-source communities and GitHub workflow systems", "Excellent descriptive copy writing and presentation layouts", "Basic HTML/CSS editing to tweak landing frameworks"],
                location: "New Delhi (On-site)",
                jobType: "Full-time",
                salaryRange: "₹8,00,000 - ₹11,00,000 PA",
                deadline: "2026-08-01",
                datePosted: new Date().toISOString().split('T')[0]
            }).save();

            console.log("MongoDB job portal database seeded successfully.");
        }
    } catch (err) {
        console.error("Failed to seed mock collections:", err);
    }
}

/* ==========================================
   AUTHENTICATION SESSION MIDDLEWARE
   ========================================== */
async function authenticateUser(req, res, next) {
    const userId = req.cookies.session_user;
    if (!userId) {
        req.user = null;
        return next();
    }

    try {
        const user = await db.User.findById(userId);
        if (!user) {
            res.clearCookie('session_user');
            req.user = null;
        } else {
            req.user = user;
        }
    } catch (e) {
        req.user = null;
    }
    next();
}

async function requireAuth(req, res, next) {
    await authenticateUser(req, res, () => {
        if (!req.user) {
            return res.status(401).json({ error: "Authentication Required" });
        }
        next();
    });
}

function requireRole(role) {
    return async (req, res, next) => {
        await requireAuth(req, res, () => {
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
app.post('/api/auth/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: "Missing required registration parameters" });
    }
    if (username.length < 3 || password.length < 6) {
        return res.status(400).json({ error: "Username (min 3 chars) or Password (min 6 chars) too short" });
    }

    try {
        // Case-insensitive duplicate check
        const exists = await db.User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (exists) {
            return res.status(409).json({ error: "Username is already taken" });
        }

        const newUser = new db.User({
            username,
            passwordHash: db.hashPassword(password),
            role: role === 'employer' ? 'employer' : 'seeker',
            profile: role === 'employer' 
                ? { companyName: "", companyDetails: "", contact: "" }
                : { contact: "", skills: [], experience: "" }
        });

        await newUser.save();
        res.cookie('session_user', newUser._id.toString(), { maxAge: 86400000, httpOnly: true });
        
        res.status(201).json({
            id: newUser._id,
            username: newUser.username,
            role: newUser.role,
            profile: newUser.profile
        });
    } catch (err) {
        res.status(500).json({ error: "Registration process encountered server fault" });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Missing username or password credentials" });
    }

    try {
        const user = await db.User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
        if (!user || user.passwordHash !== db.hashPassword(password)) {
            return res.status(401).json({ error: "Invalid username or password credentials" });
        }

        res.cookie('session_user', user._id.toString(), { maxAge: 86400000, httpOnly: true });
        
        res.status(200).json({
            id: user._id,
            username: user.username,
            role: user.role,
            profile: user.profile
        });
    } catch (err) {
        res.status(500).json({ error: "Login process encountered server fault" });
    }
});

app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('session_user');
    res.status(200).json({ message: "Successfully logged out" });
});

app.get('/api/auth/me', async (req, res) => {
    await authenticateUser(req, res, () => {
        if (!req.user) {
            return res.status(200).json(null);
        }
        res.status(200).json({
            id: req.user._id,
            username: req.user.username,
            role: req.user.role,
            profile: req.user.profile
        });
    });
});

/* ==========================================
   USER PROFILE ROUTES
   ========================================== */
app.put('/api/profile', async (req, res) => {
    await requireAuth(req, res, async () => {
        try {
            const user = await db.User.findById(req.user._id);
            if (!user) return res.status(404).json({ error: "User Session Invalid" });

            user.profile = { ...user.profile, ...req.body };
            user.markModified('profile'); // Force Mongoose to capture changes
            await user.save();

            res.status(200).json({
                id: user._id,
                username: user.username,
                role: user.role,
                profile: user.profile
            });
        } catch (err) {
            res.status(500).json({ error: "Failed to update profile configurations" });
        }
    });
});

/* ==========================================
   JOB LISTINGS CRUD ROUTES
   ========================================== */
app.get('/api/jobs', async (req, res) => {
    const { query, location, jobType } = req.query;
    let findQuery = {};

    // Filter by text queries
    if (query && query.trim() !== "") {
        const qRegex = new RegExp(query, 'i');
        findQuery.$or = [
            { title: qRegex },
            { description: qRegex },
            { requirements: qRegex }
        ];
    }

    if (location && location !== "all") {
        findQuery.location = new RegExp(location, 'i');
    }

    if (jobType && jobType !== "all") {
        findQuery.jobType = jobType;
    }

    try {
        // Find listings and populate the employer object relation
        const jobs = await db.Job.find(findQuery).populate('employerId');
        
        const enriched = jobs.map(job => ({
            id: job._id,
            employerId: job.employerId ? job.employerId._id : null,
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            location: job.location,
            jobType: job.jobType,
            salaryRange: job.salaryRange,
            deadline: job.deadline,
            filled: job.filled,
            datePosted: job.datePosted,
            companyName: job.employerId?.profile?.companyName || "Independent Employer",
            companyContact: job.employerId?.profile?.contact || ""
        }));

        res.status(200).json(enriched);
    } catch (err) {
        res.status(500).json({ error: "Server error while fetching jobs list" });
    }
});

app.get('/api/jobs/:id', async (req, res) => {
    try {
        const job = await db.Job.findById(req.params.id).populate('employerId');
        if (!job) {
            return res.status(404).json({ error: "Job Listing Not Found" });
        }

        res.status(200).json({
            id: job._id,
            employerId: job.employerId ? job.employerId._id : null,
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            location: job.location,
            jobType: job.jobType,
            salaryRange: job.salaryRange,
            deadline: job.deadline,
            filled: job.filled,
            datePosted: job.datePosted,
            companyName: job.employerId?.profile?.companyName || "Independent Employer",
            companyDetails: job.employerId?.profile?.companyDetails || "No details provided.",
            companyContact: job.employerId?.profile?.contact || ""
        });
    } catch (err) {
        res.status(500).json({ error: "Failed to load job details specifications" });
    }
});

app.post('/api/jobs', async (req, res) => {
    await requireRole('employer')(req, res, async () => {
        try {
            const newJob = new db.Job({
                employerId: req.user._id,
                title: req.body.title,
                description: req.body.description,
                requirements: req.body.requirements,
                location: req.body.location,
                jobType: req.body.jobType,
                salaryRange: req.body.salaryRange,
                deadline: req.body.deadline,
                filled: false,
                datePosted: new Date().toISOString().split('T')[0]
            });

            await newJob.save();
            res.status(201).json(newJob);
        } catch (err) {
            res.status(500).json({ error: "Failed to create new job listing" });
        }
    });
});

app.put('/api/jobs/:id', async (req, res) => {
    await requireRole('employer')(req, res, async () => {
        try {
            const job = await db.Job.findOneAndUpdate(
                { _id: req.params.id, employerId: req.user._id },
                { $set: req.body },
                { new: true } // Returns updated record
            );

            if (!job) {
                return res.status(403).json({ error: "Unauthorized access or job not found" });
            }
            res.status(200).json(job);
        } catch (err) {
            res.status(500).json({ error: "Failed to update job listing details" });
        }
    });
});

app.delete('/api/jobs/:id', async (req, res) => {
    await requireRole('employer')(req, res, async () => {
        try {
            const deleted = await db.Job.findOneAndDelete({ _id: req.params.id, employerId: req.user._id });
            if (!deleted) {
                return res.status(403).json({ error: "Unauthorized access or job not found" });
            }

            // Cascade clean applications
            await db.Application.deleteMany({ jobId: req.params.id });
            res.status(200).json({ message: "Job listing successfully deleted" });
        } catch (err) {
            res.status(500).json({ error: "Failed to delete job listing" });
        }
    });
});

/* ==========================================
   CANDIDATE APPLICATIONS PORTAL ROUTES
   ========================================== */
app.post('/api/jobs/:id/apply', async (req, res) => {
    await requireRole('seeker')(req, res, async () => {
        try {
            const alreadyApplied = await db.Application.findOne({ seekerId: req.user._id, jobId: req.params.id });
            if (alreadyApplied) {
                return res.status(400).json({ error: "You have already applied to this job listing" });
            }

            const job = await db.Job.findById(req.params.id);
            if (!job || job.filled) {
                return res.status(400).json({ error: "Job is filled or no longer accepting applications" });
            }

            const app = new db.Application({
                jobId: req.params.id,
                seekerId: req.user._id,
                coverLetter: req.body.coverLetter,
                dateApplied: new Date().toISOString().split('T')[0],
                status: "Pending"
            });

            await app.save();
            res.status(201).json(app);
        } catch (err) {
            res.status(500).json({ error: "Application submission failed" });
        }
    });
});

app.get('/api/seeker/applications', async (req, res) => {
    await requireRole('seeker')(req, res, async () => {
        try {
            const apps = await db.Application.find({ seekerId: req.user._id }).populate('jobId');
            
            const enriched = await Promise.all(apps.map(async app => {
                const job = app.jobId;
                let employer = null;
                if (job) {
                    employer = await db.User.findById(job.employerId);
                }
                return {
                    id: app._id,
                    jobId: job ? job._id : null,
                    dateApplied: app.dateApplied,
                    status: app.status,
                    coverLetter: app.coverLetter,
                    jobTitle: job ? job.title : "Deleted Position",
                    location: job ? job.location : "",
                    companyName: employer?.profile?.companyName || "Deleted Company",
                    jobFilled: job ? job.filled : true
                };
            }));

            res.status(200).json(enriched);
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch candidate applications list" });
        }
    });
});

app.get('/api/employer/applications/:jobId', async (req, res) => {
    await requireRole('employer')(req, res, async () => {
        try {
            const job = await db.Job.findOne({ _id: req.params.jobId, employerId: req.user._id });
            if (!job) {
                return res.status(403).json({ error: "Access denied to candidate application lists" });
            }

            const apps = await db.Application.find({ jobId: req.params.jobId }).populate('seekerId');
            const enriched = apps.map(app => ({
                id: app._id,
                jobId: app.jobId,
                coverLetter: app.coverLetter,
                dateApplied: app.dateApplied,
                status: app.status,
                candidateName: app.seekerId ? app.seekerId.username : "Deleted Candidate",
                candidateSkills: app.seekerId?.profile?.skills || [],
                candidateExperience: app.seekerId?.profile?.experience || "Not Provided",
                candidateContact: app.seekerId?.profile?.contact || ""
            }));

            res.status(200).json(enriched);
        } catch (err) {
            res.status(500).json({ error: "Failed to fetch candidate application list" });
        }
    });
});

app.put('/api/employer/applications/:appId', async (req, res) => {
    await requireRole('employer')(req, res, async () => {
        const { status } = req.body;
        try {
            const app = await db.Application.findById(req.params.appId);
            if (!app) {
                return res.status(404).json({ error: "Application not found" });
            }

            const job = await db.Job.findOne({ _id: app.jobId, employerId: req.user._id });
            if (!job) {
                return res.status(403).json({ error: "Access denied to status configuration" });
            }

            app.status = status;
            await app.save();
            res.status(200).json({ message: "Candidate status successfully updated" });
        } catch (err) {
            res.status(500).json({ error: "Candidate status update failed" });
        }
    });
});

// 5. Database Status Endpoint
app.get('/api/db-status', (req, res) => {
    res.status(200).json({
        isMocked: db.isMocked,
        connectionString: db.connectionString === 'none' ? 'Local JSON Storage Fallback' : db.connectionString.replace(/\/\/.*@/, '//<credentials>@')
    });
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
