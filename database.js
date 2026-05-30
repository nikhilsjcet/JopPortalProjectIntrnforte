const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Zero-dependency .env file loader for seamless local configuration
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim();
                if (key) process.env[key] = value;
            }
        });
    }
} catch (e) {
    console.error("Failed to load .env configuration:", e);
}

// SHA-256 secure password hashing wrapper
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

/* ==========================================
   MONGOOSE DATABASE SCHEMAS DEFINITION
   ========================================== */
const Schema = mongoose.Schema;

// 1. User Account & Profile Schema
const UserSchema = new Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true 
    },
    passwordHash: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['seeker', 'employer'], 
        required: true 
    },
    profile: { 
        type: Schema.Types.Mixed, 
        default: {} // Dynamic metadata (contact, skills, experience, company details)
    }
});

// 2. Job Listing Schema
const JobSchema = new Schema({
    employerId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    title: { 
        type: String, 
        required: true,
        trim: true
    },
    description: { 
        type: String, 
        required: true 
    },
    requirements: { 
        type: [String], 
        default: [] 
    },
    location: { 
        type: String, 
        required: true,
        trim: true
    },
    jobType: { 
        type: String, 
        enum: ['Full-time', 'Part-time', 'Remote', 'Contract'],
        required: true 
    },
    salaryRange: { 
        type: String, 
        default: "Not Specified" 
    },
    deadline: { 
        type: String, 
        default: "Open" 
    },
    filled: { 
        type: Boolean, 
        default: false 
    },
    datePosted: { 
        type: String, 
        required: true 
    }
});

// 3. Candidate Application Schema
const ApplicationSchema = new Schema({
    jobId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Job', 
        required: true 
    },
    seekerId: { 
        type: Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    coverLetter: { 
        type: String, 
        default: "" 
    },
    dateApplied: { 
        type: String, 
        required: true 
    },
    status: { 
        type: String, 
        enum: ['Pending', 'Reviewed', 'Shortlisted', 'Filled'], 
        default: 'Pending' 
    }
});

/* ==========================================
   RESILIENT MOCK DATABASE ENGINE FALLBACK
   ========================================== */
const DB_FILE = path.join(__dirname, 'database.json');

function readJSON() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], jobs: [], applications: [] }, null, 2));
        }
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
        return { users: [], jobs: [], applications: [] };
    }
}

function writeJSON(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Simple Mongo Query Matcher
function matches(doc, query) {
    if (!query) return true;
    for (let key in query) {
        let val = query[key];
        let docVal = doc[key];
        
        if (key === '$or' && Array.isArray(val)) {
            const matchedOr = val.some(subQuery => matches(doc, subQuery));
            if (!matchedOr) return false;
        } else if (val && typeof val === 'object' && val.$regex) {
            const regex = val.$regex instanceof RegExp ? val.$regex : new RegExp(val.$regex, 'i');
            if (!regex.test(String(docVal))) return false;
        } else {
            if (String(docVal) !== String(val)) return false;
        }
    }
    return true;
}

// Thenable Mongoose Query Emulator
class MockQuery {
    constructor(data, modelName) {
        this.data = data;
        this.modelName = modelName;
    }
    populate(pathName) {
        if (!this.data) return this;
        const dbData = readJSON();
        
        const populateDoc = (doc) => {
            if (!doc) return null;
            if (pathName === 'employerId' && this.modelName === 'Job') {
                const emp = dbData.users.find(u => String(u._id) === String(doc.employerId));
                return {
                    ...doc,
                    employerId: emp ? { _id: emp._id, username: emp.username, profile: emp.profile, role: emp.role } : null
                };
            }
            if (pathName === 'seekerId' && this.modelName === 'Application') {
                const seeker = dbData.users.find(u => String(u._id) === String(doc.seekerId));
                return {
                    ...doc,
                    seekerId: seeker ? { _id: seeker._id, username: seeker.username, profile: seeker.profile, role: seeker.role } : null
                };
            }
            if (pathName === 'jobId' && this.modelName === 'Application') {
                const job = dbData.jobs.find(j => String(j._id) === String(doc.jobId));
                let enrichedJob = null;
                if (job) {
                    const emp = dbData.users.find(u => String(u._id) === String(job.employerId));
                    enrichedJob = {
                        ...job,
                        employerId: emp ? emp._id : null
                    };
                }
                return {
                    ...doc,
                    jobId: enrichedJob
                };
            }
            return doc;
        };

        if (Array.isArray(this.data)) {
            this.data = this.data.map(populateDoc);
        } else {
            this.data = populateDoc(this.data);
        }
        return this;
    }
    map(cb) {
        return this.data.map(cb);
    }
    filter(cb) {
        return this.data.filter(cb);
    }
    then(resolve) {
        resolve(this.data);
    }
}

// Mock User Model Wrapper
function wrapUser(user) {
    if (!user) return null;
    return {
        _id: user._id,
        username: user.username,
        passwordHash: user.passwordHash,
        role: user.role,
        profile: user.profile || {},
        save: async function() {
            const data = readJSON();
            const idx = data.users.findIndex(u => String(u._id) === String(this._id));
            if (idx !== -1) {
                data.users[idx] = {
                    _id: this._id,
                    username: this.username,
                    passwordHash: this.passwordHash,
                    role: this.role,
                    profile: this.profile
                };
                writeJSON(data);
            }
            return this;
        },
        markModified: function() {}
    };
}

class MockUserClass {
    constructor(data) {
        this._id = 'usr_' + Math.random().toString(36).substring(2, 11);
        this.username = data.username;
        this.passwordHash = data.passwordHash;
        this.role = data.role;
        this.profile = data.profile || {};
    }
    async save() {
        const data = readJSON();
        const newUser = {
            _id: this._id,
            username: this.username,
            passwordHash: this.passwordHash,
            role: this.role,
            profile: this.profile
        };
        data.users.push(newUser);
        writeJSON(data);
        return wrapUser(newUser);
    }
    static async findOne(query) {
        const data = readJSON();
        const user = data.users.find(u => matches(u, query));
        return user ? wrapUser(user) : null;
    }
    static async findById(id) {
        const data = readJSON();
        const user = data.users.find(u => String(u._id) === String(id));
        return user ? wrapUser(user) : null;
    }
}

// Mock Job Model Wrapper
class MockJobClass {
    constructor(data) {
        this._id = 'job_' + Math.random().toString(36).substring(2, 11);
        this.employerId = data.employerId;
        this.title = data.title;
        this.description = data.description;
        this.requirements = data.requirements || [];
        this.location = data.location;
        this.jobType = data.jobType;
        this.salaryRange = data.salaryRange || "Not Specified";
        this.deadline = data.deadline || "Open";
        this.filled = data.filled || false;
        this.datePosted = data.datePosted || new Date().toISOString().split('T')[0];
    }
    async save() {
        const data = readJSON();
        const newJob = {
            _id: this._id,
            employerId: this.employerId,
            title: this.title,
            description: this.description,
            requirements: this.requirements,
            location: this.location,
            jobType: this.jobType,
            salaryRange: this.salaryRange,
            deadline: this.deadline,
            filled: this.filled,
            datePosted: this.datePosted
        };
        data.jobs.push(newJob);
        writeJSON(data);
        return newJob;
    }
    static async countDocuments() {
        const data = readJSON();
        return data.jobs.length;
    }
    static find(query) {
        const data = readJSON();
        let list = data.jobs;
        if (query) {
            list = list.filter(j => matches(j, query));
        }
        return new MockQuery(list, 'Job');
    }
    static findById(id) {
        const data = readJSON();
        const job = data.jobs.find(j => String(j._id) === String(id));
        return new MockQuery(job || null, 'Job');
    }
    static async findOneAndUpdate(query, update, options) {
        const data = readJSON();
        const idx = data.jobs.findIndex(j => matches(j, query));
        if (idx === -1) return null;
        
        let updatedJob = { ...data.jobs[idx] };
        if (update.$set) {
            updatedJob = { ...updatedJob, ...update.$set };
        } else {
            updatedJob = { ...updatedJob, ...update };
        }
        data.jobs[idx] = updatedJob;
        writeJSON(data);
        return updatedJob;
    }
    static async findOneAndDelete(query) {
        const data = readJSON();
        const idx = data.jobs.findIndex(j => matches(j, query));
        if (idx === -1) return null;
        
        const deleted = data.jobs[idx];
        data.jobs.splice(idx, 1);
        writeJSON(data);
        return deleted;
    }
}

// Mock Application Model Wrapper
class MockApplicationClass {
    constructor(data) {
        this._id = 'app_' + Math.random().toString(36).substring(2, 11);
        this.jobId = data.jobId;
        this.seekerId = data.seekerId;
        this.coverLetter = data.coverLetter || "";
        this.dateApplied = data.dateApplied || new Date().toISOString().split('T')[0];
        this.status = data.status || "Pending";
    }
    async save() {
        const data = readJSON();
        const newApp = {
            _id: this._id,
            jobId: this.jobId,
            seekerId: this.seekerId,
            coverLetter: this.coverLetter,
            dateApplied: this.dateApplied,
            status: this.status
        };
        data.applications.push(newApp);
        writeJSON(data);
        return newApp;
    }
    static async findOne(query) {
        const data = readJSON();
        const app = data.applications.find(a => matches(a, query));
        return app || null;
    }
    static find(query) {
        const data = readJSON();
        let list = data.applications;
        if (query) {
            list = list.filter(a => matches(a, query));
        }
        return new MockQuery(list, 'Application');
    }
    static async findById(id) {
        const data = readJSON();
        const app = data.applications.find(a => String(a._id) === String(id));
        if (!app) return null;
        return {
            ...app,
            save: async function() {
                const data = readJSON();
                const idx = data.applications.findIndex(a => String(a._id) === String(this._id));
                if (idx !== -1) {
                    data.applications[idx] = {
                        _id: this._id,
                        jobId: this.jobId,
                        seekerId: this.seekerId,
                        coverLetter: this.coverLetter,
                        dateApplied: this.dateApplied,
                        status: this.status
                    };
                    writeJSON(data);
                }
                return this;
            }
        };
    }
    static async deleteMany(query) {
        const data = readJSON();
        if (query && query.jobId) {
            data.applications = data.applications.filter(a => String(a.jobId) !== String(query.jobId));
            writeJSON(data);
        }
        return { deletedCount: 1 };
    }
}

/* ==========================================
   TCP PORT PROBE & HYBRID ADAPTER SYSTEM
   ========================================== */
function checkMongoDBPort() {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(400);
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(27017, '127.0.0.1');
    });
}

const dbDelegates = {
    User: null,
    Job: null,
    Application: null,
    isMocked: false,
    connectionString: 'none'
};

async function initializeDatabase() {
    const MONGODB_URI = process.env.MONGODB_URI;
    let useMongo = false;
    
    if (MONGODB_URI) {
        useMongo = true;
        dbDelegates.connectionString = MONGODB_URI;
    } else {
        const localMongoActive = await checkMongoDBPort();
        if (localMongoActive) {
            useMongo = true;
            dbDelegates.connectionString = 'mongodb://127.0.0.1:27017/talenthub';
        } else {
            useMongo = false;
        }
    }
    
    if (useMongo) {
        const User = mongoose.model('User', UserSchema);
        const Job = mongoose.model('Job', JobSchema);
        const Application = mongoose.model('Application', ApplicationSchema);
        
        dbDelegates.User = User;
        dbDelegates.Job = Job;
        dbDelegates.Application = Application;
        dbDelegates.isMocked = false;
    } else {
        dbDelegates.User = MockUserClass;
        dbDelegates.Job = MockJobClass;
        dbDelegates.Application = MockApplicationClass;
        dbDelegates.isMocked = true;
        
        // Seed local JSON if empty
        try {
            const data = readJSON();
            if (data.jobs.length === 0) {
                let employer = data.users.find(u => u.username === "stellar_corp");
                if (!employer) {
                    employer = {
                        _id: "usr_5dohpci6v",
                        username: "stellar_corp",
                        passwordHash: hashPassword("stellar123"),
                        role: "employer",
                        profile: {
                            companyName: "Stellar Systems Co.",
                            companyDetails: "Stellar Systems is a premier systems engineering and web engineering collective focusing on distributed databases and high-performance frontend interfaces.",
                            contact: "careers@stellar.co"
                        }
                    };
                    data.users.push(employer);
                }
                
                data.jobs.push({
                    _id: "job_o6vgte29h",
                    employerId: employer._id,
                    title: "Senior Rust Systems Architect",
                    description: "We are seeking a senior systems software architect to build out high-performance database middleware frameworks. You will leverage Axum, Tokio, and lock-free thread structures to engineer distributed log networks.",
                    requirements: ["5+ Years systems engineering experience", "Proficiency in Rust, Tokio, and Cargo dependencies", "Familiarity with SQLite, relational engines, and TCP streams", "Degree in Computer Science or equivalent practical exposure"],
                    location: "Bengaluru (Hybrid)",
                    jobType: "Full-time",
                    salaryRange: "₹24,00,000 - ₹36,00,000 PA",
                    deadline: "2026-07-15",
                    filled: false,
                    datePosted: new Date().toISOString().split('T')[0]
                });
                
                data.jobs.push({
                    _id: "job_vtgmfo2vi",
                    employerId: employer._id,
                    title: "UI/UX Full-Stack Engineer",
                    description: "Join our core UI experience group to engineer gorgeous, micro-interaction-driven web clients. You will build clean glassmorphic components, fluid CSS transition layers, and reactive vanilla JS states connected to Node APIs.",
                    requirements: ["3+ Years frontend or fullstack experience", "Deep knowledge of HTML5, CSS Variables, and responsive Flex/Grid rules", "Experience with Node.js, Express, and REST API payload integrations", "Strong aesthetic eye for sleek, harmonization dark/light modes"],
                    location: "Remote",
                    jobType: "Remote",
                    salaryRange: "₹12,00,000 - ₹18,00,000 PA",
                    deadline: "2026-06-30",
                    filled: false,
                    datePosted: new Date().toISOString().split('T')[0]
                });
                
                data.jobs.push({
                    _id: "job_5b5s3x2l0",
                    employerId: employer._id,
                    title: "Marketing & Community Operations Manager",
                    description: "Help scale our open-source developer hub! You will lead community outreach, design premium branding materials, coordinate technical blog releases, and represent the brand at national systems engineering meetups.",
                    requirements: ["2+ Years technical product marketing or community management", "Familiarity with open-source communities and GitHub workflow systems", "Excellent descriptive copy writing and presentation layouts", "Basic HTML/CSS editing to tweak landing frameworks"],
                    location: "New Delhi (On-site)",
                    jobType: "Full-time",
                    salaryRange: "₹8,00,000 - ₹11,00,000 PA",
                    deadline: "2026-08-01",
                    filled: false,
                    datePosted: new Date().toISOString().split('T')[0]
                });
                
                writeJSON(data);
            }
        } catch (e) {
            console.error("Local pre-seed fail:", e);
        }
    }
}

initializeDatabase();

module.exports = {
    get User() { return dbDelegates.User; },
    get Job() { return dbDelegates.Job; },
    get Application() { return dbDelegates.Application; },
    get isMocked() { return dbDelegates.isMocked; },
    get connectionString() { return dbDelegates.connectionString; },
    hashPassword
};
