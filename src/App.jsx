import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendPasswordResetEmail
} from 'firebase/auth';
import {
    getFirestore,
    doc,
    setDoc,
    getDoc,
    collection,
    addDoc,
    query,
    where,
    onSnapshot,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    getDocs
} from 'firebase/firestore';

// Note: jsPDF and html2canvas imports are commented out to prevent build errors in the web preview environment.
// import jsPDF from 'jspdf';
// import html2canvas from 'html2canvas';

// --- Helper Components & Icons ---

const Spinner = () => (
    <div className="flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
    </div>
);

const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-center z-50">
                    <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800">&times;</button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </div>
    );
};

// --- Helper function for safe JSON parsing ---
const safeJsonParse = (text) => {
    try {
        // 1. Remove markdown code blocks
        let cleanText = text.replace(/```json|```/g, '').trim();
        
        // 2. Find the first '{' and last '}' to extract the JSON object
        const firstBrace = cleanText.indexOf('{');
        const lastBrace = cleanText.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            cleanText = cleanText.substring(firstBrace, lastBrace + 1);
        }
        
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("JSON Parse Error:", e);
        console.log("Failed text:", text);
        return { topics: [], questions: [] };
    }
};

// --- Firebase Initialization ---
const firebaseConfig = {
    apiKey: "AIzaSyCor-_p6lJgjuhmRugz-bwtaQ2VmSeKXL0",
    authDomain: "assignment-7e9e7.firebaseapp.com",
    projectId: "assignment-7e9e7",
    storageBucket: "assignment-7e9e7.appspot.com",
    messagingSenderId: "55465207669",
    appId: "1:55465207669:web:5e2e12a0695676b6be153c",
    measurementId: "G-TBZJC4CFL6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- API Key Configuration ---
const GEMINI_API_KEY = "AIzaSyDvS6aA74zN2KwB1A5JNHQohvoIxxJ2q20"; // User provided key

// --- Main App Component ---
function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState(null);
    const [authStatus, setAuthStatus] = useState('loading'); // loading, approved, pending, none

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                const userDocRef = doc(db, "users", currentUser.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    setUser(currentUser);
                    setRole(userData.role);
                    if (userData.status === 'approved') {
                        setAuthStatus('approved');
                    } else {
                        setAuthStatus('pending');
                    }
                } else {
                    const studentDocRef = doc(db, "students", currentUser.uid);
                    const studentDoc = await getDoc(studentDocRef);
                    if (studentDoc.exists()) {
                        setUser({ ...currentUser, ...studentDoc.data() });
                        setRole('student');
                        setAuthStatus('approved');
                    } else {
                        await signOut(auth);
                    }
                }
            } else {
                setUser(null);
                setRole(null);
                setAuthStatus('none');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleSignOut = async () => {
        speechSynthesis.cancel(); // Stop any speech on signout
        await signOut(auth);
    };

    if (loading || authStatus === 'loading') {
        return <div className="h-screen w-screen flex items-center justify-center"><Spinner /></div>;
    }

    let content;
    if (authStatus === 'none') {
        content = <AuthScreen />;
    } else if (authStatus === 'pending') {
        content = <div className="text-center p-8 bg-white rounded-lg shadow-md">
            <h2 className="text-2xl font-semibold text-yellow-600">Account Pending Approval</h2>
            <p className="text-gray-600 mt-2">Your account has been created but is waiting for an administrator to approve it. Please check back later.</p>
        </div>;
    } else if (authStatus === 'approved') {
        if (role === 'parent') {
            content = <ParentDashboard user={user} />;
        } else if (role === 'student') {
            content = <StudentDashboard user={user} />;
        } else if (role === 'admin') {
            content = <AdminDashboard user={user} />;
        }
    }

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="bg-white shadow-md sticky top-0 z-40">
                <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
                    <div className="text-2xl font-bold text-indigo-600">AI Learning Hub</div>
                    {user && (<button onClick={handleSignOut} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Sign Out</button>)}
                </nav>
            </header>
            <main className="container mx-auto p-4 md:p-6">{content}</main>
        </div>
    );
}

// --- Authentication Screen ---
function AuthScreen() {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: userCredential.user.email,
                    role: 'parent',
                    status: 'pending',
                    createdAt: serverTimestamp(),
                    managedStudentIds: []
                });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto mt-10 bg-white p-8 rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">{isLogin ? 'Login' : 'Parent Sign Up'}</h2>
            <form onSubmit={handleSubmit}>
                <div className="mb-4">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">Email</label>
                    <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" required />
                </div>
                <div className="mb-6">
                    <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Password</label>
                    <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700" required />
                </div>
                {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
                <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">{loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}</button>
            </form>
            <p className="text-center text-gray-500 text-sm mt-6">{isLogin ? "Don't have an account?" : "Already have an account?"}<button onClick={() => setIsLogin(!isLogin)} className="font-bold text-indigo-600 hover:text-indigo-800 ml-1">{isLogin ? 'Sign Up' : 'Sign In'}</button></p>
        </div>
    );
}

// --- Admin Dashboard ---
function AdminDashboard({ user }) {
    const [pendingParents, setPendingParents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "users"), where("status", "==", "pending"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingParents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleApprove = async (parentId) => {
        const parentRef = doc(db, "users", parentId);
        await updateDoc(parentRef, { status: 'approved' });
    };

    if (loading) return <Spinner />;

    return (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Admin Dashboard</h1>
            <h2 className="text-xl font-semibold text-gray-700 mb-4">Pending Parent Approvals</h2>
            <div className="space-y-4">
                {pendingParents.length > 0 ? pendingParents.map(parent => (
                    <div key={parent.id} className="border p-4 rounded-lg flex justify-between items-center">
                        <p>{parent.email}</p>
                        <button onClick={() => handleApprove(parent.id)} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">
                            Approve
                        </button>
                    </div>
                )) : <p>No pending approvals.</p>}
            </div>
        </div>
    );
}


// --- Parent Dashboard ---
function ParentDashboard({ user }) {
    const [students, setStudents] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [quranAssignments, setQuranAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isStudentModalOpen, setStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState(null);
    const [isAssignmentModalOpen, setAssignmentModalOpen] = useState(false);
    const [assignmentType, setAssignmentType] = useState('academic'); // 'academic' or 'quran'
    const [selectedStudentForAssignment, setSelectedStudentForAssignment] = useState(null);
    const [viewingAssignment, setViewingAssignment] = useState(null);

    useEffect(() => {
        const studentsQuery = query(collection(db, "students"), where("parentId", "==", user.uid));
        const unsubStudents = onSnapshot(studentsQuery, (snapshot) => {
            setStudents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });

        const assignmentsQuery = query(collection(db, "assignments"), where("parentId", "==", user.uid));
        const unsubAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
            setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'academic' })));
        });
        
        const quranAssignmentsQuery = query(collection(db, "quranAssignments"), where("parentId", "==", user.uid));
        const unsubQuranAssignments = onSnapshot(quranAssignmentsQuery, (snapshot) => {
            setQuranAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'quran' })));
        });

        return () => { unsubStudents(); unsubAssignments(); unsubQuranAssignments() };
    }, [user.uid]);

    const handleOpenStudentModal = (student = null) => {
        setEditingStudent(student);
        setStudentModalOpen(true);
    };
    
    const handleCloseStudentModal = () => {
        setEditingStudent(null);
        setStudentModalOpen(false);
    };

    const handleDeleteStudent = async (studentId) => {
        try {
            await deleteDoc(doc(db, "students", studentId));
            const parentRef = doc(db, "users", user.uid);
            const parentDoc = await getDoc(parentRef);
            if (parentDoc.exists()) {
                const updatedManagedIds = (parentDoc.data().managedStudentIds || []).filter(id => id !== studentId);
                await updateDoc(parentRef, { managedStudentIds: updatedManagedIds });
            }
        } catch (error) {
            console.error("Error deleting student:", error);
            alert("Failed to delete student.");
        }
    };

    const handleCreateAssignment = (student) => {
        setSelectedStudentForAssignment(student);
        setAssignmentModalOpen(true);
    };
    
    const handleDeleteAssignment = async (assignmentId, type) => {
        const collectionName = type === 'quran' ? 'quranAssignments' : 'assignments';
        try {
            await deleteDoc(doc(db, collectionName, assignmentId));
        } catch (error) {
            console.error("Error deleting assignment:", error);
            alert("Failed to delete assignment.");
        }
    };

    const getStudentName = (studentId) => {
        const student = students.find(s => s.id === studentId);
        return student ? `${student.firstName} ${student.lastName}` : '...';
    };
    
    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        return new Date(timestamp.seconds * 1000).toLocaleDateString();
    };

    const allAssignments = [...assignments, ...quranAssignments].sort((a,b) => b.createdAt - a.createdAt);

    if (loading) return <Spinner />;
    
    if (viewingAssignment) {
        if(viewingAssignment.type === 'quran'){
            return <QuranReader assignment={viewingAssignment} onBack={() => setViewingAssignment(null)} />;
        }
        return <AssignmentDetailView assignment={viewingAssignment} onBack={() => setViewingAssignment(null)} studentName={getStudentName(viewingAssignment.studentId)} />;
    }

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Parent Dashboard</h1>
            <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-semibold text-gray-700">Student Profiles</h2>
                    <button onClick={() => handleOpenStudentModal()} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg">Add Student</button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {students.map(student => (
                        <div key={student.id} className="bg-gray-100 p-4 rounded-lg flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-lg text-indigo-700">{student.firstName} {student.lastName}</h3>
                                <p className="text-sm text-gray-600">{student.grade}</p>
                                <p className="text-xs text-gray-500 mt-1">{student.email}</p>
                            </div>
                            <div className="mt-4 flex space-x-2">
                                <button onClick={() => handleOpenStudentModal(student)} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-2 rounded-md">Edit</button>
                                <button onClick={() => handleDeleteStudent(student.id)} className="flex-1 bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2 rounded-md">Delete</button>
                                <button onClick={() => handleCreateAssignment(student)} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-1 px-2 rounded-md">Assign</button>
                            </div>
                        </div>
                    ))}
                </div>
                {students.length === 0 && <p className="text-gray-500">No student profiles yet.</p>}
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
                 <h2 className="text-2xl font-semibold text-gray-700 mb-4">Assignments Overview</h2>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Assignment</th>
                                <th scope="col" className="px-6 py-3">Student</th>
                                <th scope="col" className="px-6 py-3">Assigned</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Score</th>
                                <th scope="col" className="px-6 py-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allAssignments.map(assignment => (
                                <React.Fragment key={assignment.id}>
                                    <tr className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">
                                            {assignment.type === 'quran' ? `Surah ${assignment.surahNumber}: ${assignment.startAyah}-${assignment.endAyah}` : `${assignment.subject}: ${assignment.topic}`}
                                            {assignment.createdBy === 'student' && <span className="text-xs text-gray-500">(Self-Assessed)</span>}
                                        </td>
                                        <td className="px-6 py-4">{getStudentName(assignment.studentId)}</td>
                                        <td className="px-6 py-4">{formatDate(assignment.createdAt)}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                                {'Not Started': 'bg-gray-200 text-gray-800', 'In Progress': 'bg-blue-200 text-blue-800', 'Completed': 'bg-green-200 text-green-800'}[assignment.status] || 'bg-gray-200 text-gray-800'
                                            }`}>{assignment.status}</span>
                                        </td>
                                        <td className="px-6 py-4 font-bold text-indigo-600">{assignment.score != null ? `${assignment.score}%` : 'N/A'}</td>
                                        <td className="px-6 py-4 flex space-x-2">
                                            <button onClick={() => setViewingAssignment(assignment)} className="text-blue-600 hover:underline">View</button>
                                            <button onClick={() => handleDeleteAssignment(assignment.id, assignment.type)} className="text-red-600 hover:underline">Delete</button>
                                        </td>
                                    </tr>
                                    {assignment.aiSuggestion && (
                                        <tr className="bg-gray-50 border-b">
                                            <td colSpan="6" className="px-6 py-2 text-xs italic text-gray-600">
                                                <b>AI Suggestion:</b> {assignment.aiSuggestion}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                 </div>
                 {allAssignments.length === 0 && <p className="text-gray-500 text-center py-4">No assignments created yet.</p>}
            </div>
            <Modal isOpen={isStudentModalOpen} onClose={handleCloseStudentModal} title={editingStudent ? "Edit Student Profile" : "Add New Student Profile"}>
                <StudentProfileForm parentUser={user} onComplete={handleCloseStudentModal} existingStudent={editingStudent} />
            </Modal>
            <Modal isOpen={isAssignmentModalOpen} onClose={() => setAssignmentModalOpen(false)} title="Create Assignment">
                {selectedStudentForAssignment && (
                    <div>
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700">Assignment Type</label>
                            <select value={assignmentType} onChange={(e) => setAssignmentType(e.target.value)} className="w-full p-2 border rounded mt-1">
                                <option value="academic">Academic Assignment</option>
                                <option value="quran">Quran Recitation</option>
                            </select>
                        </div>
                        {assignmentType === 'academic' ? (
                            <AssignmentGenerator student={selectedStudentForAssignment} onComplete={() => setAssignmentModalOpen(false)} parentId={user.uid} />
                        ) : (
                            <QuranAssignmentForm student={selectedStudentForAssignment} onComplete={() => setAssignmentModalOpen(false)} parentId={user.uid} />
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
}

// --- Student Dashboard & Assignment View ---
function StudentDashboard({ user }) {
    const [assignments, setAssignments] = useState([]);
    const [quranAssignments, setQuranAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [takingAssignment, setTakingAssignment] = useState(null);
    const [isExplorerOpen, setExplorerOpen] = useState(false);

    useEffect(() => {
        const assignmentsQuery = query(collection(db, "assignments"), where("studentId", "==", user.uid));
        const unsubAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
            setAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'academic' })));
            setLoading(false);
        });

        const quranAssignmentsQuery = query(collection(db, "quranAssignments"), where("studentId", "==", user.uid));
        const unsubQuranAssignments = onSnapshot(quranAssignmentsQuery, (snapshot) => {
            setQuranAssignments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'quran' })));
        });

        return () => { unsubAssignments(); unsubQuranAssignments(); };
    }, [user.uid]);

    if (loading) return <Spinner />;

    if (takingAssignment) {
        if(takingAssignment.type === 'quran'){
            return <QuranReader assignment={takingAssignment} onBack={() => setTakingAssignment(null)} />;
        }
        return <AssignmentView assignment={takingAssignment} onBack={() => setTakingAssignment(null)} userRole="student" />;
    }

    const allAssignments = [...assignments, ...quranAssignments].sort((a,b) => b.createdAt - a.createdAt);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                 <h1 className="text-3xl font-bold text-gray-800">My Assignments</h1>
                 <button onClick={() => setExplorerOpen(true)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-lg">Explore & Self-Assess</button>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Assignment</th>
                                <th scope="col" className="px-6 py-3">Type</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3">Score</th>
                                <th scope="col" className="px-6 py-3">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allAssignments.map(assignment => (
                                <tr key={assignment.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">
                                        {assignment.type === 'quran' ? `Surah ${assignment.surahNumber}` : `${assignment.subject}: ${assignment.topic}`}
                                        {assignment.createdBy === 'student' && <span className="text-xs text-purple-500">(Self-Assessed)</span>}
                                    </td>
                                    <td className="px-6 py-4">{assignment.type === 'quran' ? 'Quran' : 'Academic'}</td>
                                    <td className="px-6 py-4">{assignment.status}</td>
                                    <td className="px-6 py-4 font-semibold text-indigo-600">{assignment.score != null ? `${assignment.score}%` : 'N/A'}</td>
                                    <td className="px-6 py-4">
                                        <button onClick={() => setTakingAssignment(assignment)} className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-1 px-3 rounded-md">
                                            {assignment.status === 'Not Started' ? 'Start' : 'View'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {allAssignments.length === 0 && <p className="text-center text-gray-500 py-8">You have no assignments.</p>}
            </div>
             <Modal isOpen={isExplorerOpen} onClose={() => setExplorerOpen(false)} title="Explore New Topics">
                <TopicExplorer student={user} onAssignmentCreated={() => setExplorerOpen(false)} />
            </Modal>
        </div>
    );
}

function AssignmentView({ assignment, onBack, userRole }) {
    const [answers, setAnswers] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const attemptedCount = Object.values(answers).filter(a => a !== '').length;

    useEffect(() => {
        const initialAnswers = {};
        assignment.questions.forEach(q => {
            initialAnswers[q.id] = q.studentAnswer || '';
        });
        setAnswers(initialAnswers);
    }, [assignment]);

    const handleAnswerChange = (qId, answer) => {
        setAnswers(prev => ({ ...prev, [qId]: answer }));
        if (assignment.status === 'Not Started') {
            updateDoc(doc(db, "assignments", assignment.id), { status: 'In Progress' });
        }
    };

    const handleSaveProgress = async () => {
        setSaving(true);
        const updatedQuestions = assignment.questions.map(q => ({
            ...q,
            studentAnswer: answers[q.id] || ''
        }));
        await updateDoc(doc(db, "assignments", assignment.id), { questions: updatedQuestions });
        setSaving(false);
        alert("Progress Saved!");
    };

    const handleSubmit = async () => {
        setSubmitting(true);
        let score = 0;
        let maxScore = 0;

        const updatedQuestions = assignment.questions.map(q => {
            const studentAnswer = answers[q.id];
            let isCorrect = null;
            if (q.type === 'MCQ') {
                maxScore += 10;
                isCorrect = studentAnswer === q.correctAnswer;
                if (isCorrect) score += 10;
            } else {
                maxScore += 10;
            }
            return { ...q, studentAnswer, isCorrect };
        });

        const finalScore = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
        
        const feedbackPrompt = `A student completed an assignment on "${assignment.topic}". Their score was ${finalScore}%. Here are the questions and their answers: ${JSON.stringify(updatedQuestions)}. Provide a brief, one-sentence suggestion for the parent on what the student should focus on next.`;
        let aiSuggestion = "Good effort!";
        try {
            const apiKey = GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: feedbackPrompt }] }] };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (response.ok) {
                const result = await response.json();
                aiSuggestion = result?.candidates?.[0]?.content?.parts?.[0]?.text || aiSuggestion;
            }
        } catch (err) {
            console.error("AI feedback generation failed:", err);
        }

        await updateDoc(doc(db, "assignments", assignment.id), {
            questions: updatedQuestions,
            status: 'Completed',
            score: finalScore,
            aiSuggestion: aiSuggestion.trim()
        });

        setSubmitting(false);
        onBack();
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-start mb-4">
                <div>
                    <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold">&larr; Back to Dashboard</button>
                    <h2 className="text-3xl font-bold mt-2">{assignment.subject}: {assignment.topic}</h2>
                </div>
                <div className="text-right">
                    <p className="font-semibold">Attempted: {attemptedCount} / {assignment.questions.length}</p>
                    <p className="text-sm text-gray-600">Status: {assignment.status}</p>
                </div>
            </div>
            
            {assignment.explanation && (
                <div className="mb-8 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <h3 className="text-xl font-bold text-indigo-800 mb-2">Topic Explanation</h3>
                    <p className="text-gray-700 whitespace-pre-wrap">{assignment.explanation}</p>
                </div>
            )}

            {assignment.examples && assignment.examples.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-xl font-bold text-indigo-800 mb-2">Examples</h3>
                    <div className="space-y-4">
                        {assignment.examples.map((ex, index) => (
                            <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                                <p className="font-semibold text-gray-800"><b>Example {index + 1}:</b> {ex.problem}</p>
                                <p className="mt-2 text-sm text-green-700 bg-green-50 p-2 rounded"><b>Solution:</b> {ex.solution}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-8">
                {assignment.questions.map((q, index) => (
                    <div key={q.id}>
                        <p className="font-semibold text-lg mb-2">{index + 1}. {q.text}</p>
                        {q.type === 'MCQ' ? (
                            <div className="space-y-2">{q.options.map(option => (<label key={option} className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50"><input type="radio" name={q.id} value={option} checked={answers[q.id] === option} onChange={(e) => handleAnswerChange(q.id, e.target.value)} className="h-4 w-4 text-indigo-600" disabled={userRole !== 'student'} /><span className="ml-3 text-gray-700">{option}</span></label>))}</div>
                        ) : (
                            <textarea value={answers[q.id]} onChange={(e) => handleAnswerChange(q.id, e.target.value)} rows="4" className="w-full p-2 border rounded-md" placeholder="Your answer..." disabled={userRole !== 'student'} />
                        )}
                    </div>
                ))}
            </div>
            {userRole === 'student' && assignment.status !== 'Completed' && (
                <div className="mt-8 flex items-center space-x-4">
                    <button onClick={handleSaveProgress} disabled={saving || submitting} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg">{saving ? 'Saving...' : 'Save Progress'}</button>
                    <button onClick={handleSubmit} disabled={submitting || saving} className="bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg">{submitting ? 'Submitting...' : 'Submit for Grading'}</button>
                </div>
            )}
        </div>
    );
}


// --- Parent's Assignment Detail View ---
function AssignmentDetailView({ assignment, onBack, studentName }) {
    const contentRef = React.useRef();
    const [comment, setComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    const handleAddComment = async () => {
        if (!comment.trim()) return;
        setIsSubmittingComment(true);
        try {
            const assignmentRef = doc(db, "assignments", assignment.id);
            await updateDoc(assignmentRef, { parentComment: comment });
            setComment('');
        } catch (error) {
            console.error("Error adding comment:", error);
            alert("Failed to add comment.");
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleDownloadPdf = () => {
        // PDF generation functionality temporarily disabled for this environment
        alert("PDF download is not available in this demo environment.");
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <button onClick={onBack} className="text-indigo-600 hover:text-indigo-800 font-semibold">&larr; Back to Dashboard</button>
                <button onClick={handleDownloadPdf} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg">Download as PDF</button>
            </div>
            <div ref={contentRef} className="bg-white p-8 rounded-lg shadow-lg">
                <h2 className="text-3xl font-bold mb-2">{assignment.subject}: {assignment.topic}</h2>
                <p className="text-gray-600 mb-2">For: {studentName}</p>
                <p className="text-gray-600 mb-8">Status: {assignment.status} {assignment.score != null && `| Score: ${assignment.score}%`}</p>
                
                {assignment.explanation && (
                    <div className="mb-8 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                        <h3 className="text-xl font-bold text-indigo-800 mb-2">Topic Explanation</h3>
                        <p className="text-gray-700 whitespace-pre-wrap">{assignment.explanation}</p>
                    </div>
                )}

                {assignment.examples && assignment.examples.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-xl font-bold text-indigo-800 mb-2">Examples</h3>
                        <div className="space-y-4">
                            {assignment.examples.map((ex, index) => (
                                <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                                    <p className="font-semibold text-gray-800"><b>Example {index + 1}:</b> {ex.problem}</p>
                                    <p className="mt-2 text-sm text-green-700 bg-green-50 p-2 rounded"><b>Solution:</b> {ex.solution}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="space-y-8">
                    {assignment.questions.map((q, index) => (
                        <div key={q.id} className="border-t pt-4">
                            <p className="font-semibold text-lg mb-2">{index + 1}. {q.text}</p>
                            <p className="text-sm text-gray-700 bg-gray-100 p-2 rounded-md"><b>Student's Answer:</b> {q.studentAnswer || 'Not answered'}</p>
                            {q.type === 'MCQ' && <p className={`text-sm mt-2 p-2 rounded-md ${q.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}><b>Correct Answer:</b> {q.correctAnswer}</p>}
                        </div>
                    ))}
                </div>
            </div>
             <div className="mt-6 bg-white p-6 rounded-lg shadow-md">
                <h3 className="text-xl font-semibold mb-3">Add a Comment</h3>
                <div className="flex items-center gap-2 mb-3">
                    {["Good Job!", "Great Effort!", "Keep Practicing!"].map(c => (
                        <button key={c} onClick={() => setComment(c)} className="text-xs bg-gray-200 hover:bg-gray-300 text-gray-800 py-1 px-3 rounded-full">{c}</button>
                    ))}
                </div>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows="3" className="w-full p-2 border rounded-md" placeholder="Leave feedback for the student..."></textarea>
                <button onClick={handleAddComment} disabled={isSubmittingComment} className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
                    {isSubmittingComment ? 'Adding...' : 'Add Comment'}
                </button>
            </div>
        </div>
    );
}


// --- Student Profile Form ---
function StudentProfileForm({ parentUser, onComplete, existingStudent }) {
    const initialFormData = {
        email: '', password: '', firstName: '', lastName: '', age: '', dob: '', grade: 'Pre-K', schoolType: 'Public',
        learningStyle: [], assignmentFormat: [], strengths: [], weaknesses: [], targetSubjects: [],
    };
    const [formData, setFormData] = useState(initialFormData);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ type: '', text: '' });

    useEffect(() => {
        if (existingStudent) {
            const studentData = { ...initialFormData, ...existingStudent };
            Object.keys(studentData).forEach(key => {
                if (Array.isArray(initialFormData[key]) && !Array.isArray(studentData[key])) {
                    studentData[key] = [];
                }
            });
            setFormData(studentData);
        } else {
            setFormData(initialFormData);
        }
    }, [existingStudent]);
    
    const handleMultiSelectChange = (e) => {
        const { name, value, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked ? [...(prev[name] || []), value] : (prev[name] || []).filter(item => item !== value) }));
    };
    
    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handlePasswordReset = async () => {
        if (!existingStudent?.email) {
            setMessage({ type: 'error', text: 'Student email is not available.' });
            return;
        }
        try {
            await sendPasswordResetEmail(auth, existingStudent.email);
            setMessage({ type: 'success', text: `Password reset email sent to ${existingStudent.email}` });
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to send password reset email.' });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage({ type: '', text: '' });
        try {
            if (existingStudent) {
                const { email, password, ...profileData } = formData;
                await updateDoc(doc(db, "students", existingStudent.id), profileData);
                setMessage({ type: 'success', text: 'Profile updated successfully!' });
            } else {
                const tempApp = initializeApp(firebaseConfig, 'student-creator');
                const tempAuth = getAuth(tempApp);
                const userCredential = await createUserWithEmailAndPassword(tempAuth, formData.email, formData.password);
                const studentUid = userCredential.user.uid;

                const { password, ...profileData } = formData;
                await setDoc(doc(db, "students", studentUid), { 
                    ...profileData, 
                    parentId: parentUser.uid, 
                    createdAt: serverTimestamp() 
                });

                const parentRef = doc(db, "users", parentUser.uid);
                const parentDoc = await getDoc(parentRef);
                if (parentDoc.exists()) {
                    await updateDoc(parentRef, { managedStudentIds: [...(parentDoc.data().managedStudentIds || []), studentUid] });
                }
                
                await signOut(tempAuth);
                await deleteApp(tempApp);

                setMessage({ type: 'success', text: 'Student account created successfully!' });
            }
            setTimeout(() => onComplete(), 2000);
        } catch (error) {
            setMessage({ type: 'error', text: `Failed to save profile: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };
    
    const renderCheckboxGroup = (name, options) => (
        <div className="flex flex-wrap gap-x-4 gap-y-2">{options.map(option => (<label key={option} className="inline-flex items-center"><input type="checkbox" name={name} value={option} checked={formData[name]?.includes(option)} onChange={handleMultiSelectChange} className="form-checkbox h-4 w-4 text-indigo-600" /><span className="ml-2 text-gray-700 text-sm">{option}</span></label>))}</div>
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {!existingStudent ? (
                <fieldset className="border p-4 rounded-md">
                    <legend className="text-lg font-semibold px-2">Student Credentials</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                        <input type="email" name="email" value={formData.email} onChange={handleChange} placeholder="Student's Login Email" className="w-full p-2 border rounded" required />
                        <input type="password" name="password" value={formData.password} onChange={handleChange} placeholder="Initial Password" className="w-full p-2 border rounded" required />
                    </div>
                </fieldset>
            ) : (
                 <fieldset className="border p-4 rounded-md">
                    <legend className="text-lg font-semibold px-2">Manage Password</legend>
                    <div className="mt-2">
                        <p className="text-sm text-gray-600 mb-2">Student's Login Email: <b>{formData.email}</b></p>
                        <button type="button" onClick={handlePasswordReset} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">
                            Send Password Reset Email
                        </button>
                    </div>
                </fieldset>
            )}
            <fieldset className="border p-4 rounded-md"><legend className="text-lg font-semibold px-2">Basic Information</legend><div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2"><input name="firstName" value={formData.firstName} onChange={handleChange} placeholder="First Name" className="w-full p-2 border rounded" required /><input name="lastName" value={formData.lastName} onChange={handleChange} placeholder="Last Name" className="w-full p-2 border rounded" required /><input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="Age" className="w-full p-2 border rounded" /><input type="date" name="dob" value={formData.dob} onChange={handleChange} className="w-full p-2 border rounded" /><select name="grade" value={formData.grade} onChange={handleChange} className="w-full p-2 border rounded">{['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th', 'ACT/SAT Aspirant'].map(g => <option key={g}>{g}</option>)}</select><select name="schoolType" value={formData.schoolType} onChange={handleChange} className="w-full p-2 border rounded">{['Public', 'Private', 'Homeschool', 'Charter'].map(s => <option key={s}>{s}</option>)}</select></div></fieldset>
            <fieldset className="border p-4 rounded-md"><legend className="text-lg font-semibold px-2">Learning & Proficiency</legend><div className="space-y-4 mt-2"><div><label className="font-medium text-sm">Learning Style</label>{renderCheckboxGroup('learningStyle', ['Visual', 'Auditory', 'Kinesthetic', 'Reading/Writing'])}</div><div><label className="font-medium text-sm">Learning Style</label>{renderCheckboxGroup('learningStyle', ['Visual', 'Auditory', 'Kinesthetic', 'Reading/Writing'])}</div><div><label className="font-medium text-sm">Strengths</label>{renderCheckboxGroup('strengths', ['Math', 'Reading', 'Science', 'Writing', 'History', 'Art'])}</div><div><label className="font-medium text-sm">Weaknesses</label>{renderCheckboxGroup('weaknesses', ['Math', 'Reading', 'Science', 'Writing', 'Grammar'])}</div></div></fieldset>
            {message.text && <div className={`p-2 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{message.text}</div>}
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">{loading ? 'Saving...' : 'Save Profile'}</button>
        </form>
    );
}

// --- Topic Explorer for Students ---
function TopicExplorer({ student, onAssignmentCreated }) {
    const [subject, setSubject] = useState('');
    const [loading, setLoading] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [quizCriteria, setQuizCriteria] = useState({
        difficulty: 'Medium',
        numQuestions: 10,
        assignmentFormat: ['MCQ', 'Short Answer'],
    });
    const [generatingQuiz, setGeneratingQuiz] = useState(false);

    const handleSuggestTopics = async () => {
        if (!subject) {
            alert("Please enter a subject.");
            return;
        }
        setLoading(true);
        setSuggestions([]);
        const prompt = `A ${student.grade} student wants to learn about "${subject}". Suggest 5 specific topics. For each topic, provide a brief "explanation", a simple "example", and a "quickTip". Return a JSON object with a "topics" array where each element is an object with "topicName", "explanation", "example", and "quickTip" keys. Return ONLY valid JSON. Do not use markdown formatting. Do not include trailing commas.`;
        try {
            const apiKey = GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            const data = safeJsonParse(text);
            setSuggestions(data.topics || []);
        } catch (err) {
            console.error("Topic suggestion failed:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateQuiz = async (e) => {
        e.preventDefault();
        setGeneratingQuiz(true);
        
        const assignmentData = {
            subject,
            topics: selectedTopic.topicName,
            ...quizCriteria,
            createdBy: 'student',
            assignmentPurpose: 'Practice'
        };
        
        try {
            await generateAssignmentAI(student, student.parentId, assignmentData, onAssignmentCreated);
        } catch (error) {
            alert("Failed to generate quiz. Please try again.");
        } finally {
            setGeneratingQuiz(false);
        }
    };

    const handleCriteriaChange = (e) => {
        const { name, value } = e.target;
        setQuizCriteria(prev => ({ ...prev, [name]: value }));
    };

    const handleFormatChange = (e) => {
        const { value, checked } = e.target;
        setQuizCriteria(prev => ({ ...prev, assignmentFormat: checked ? [...prev.assignmentFormat, value] : prev.assignmentFormat.filter(f => f !== value) }));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter a subject (e.g., Physics)" className="w-full p-2 border rounded" />
                <button onClick={handleSuggestTopics} disabled={loading} className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-2 px-4 rounded">
                    {loading ? <Spinner /> : "Explore"}
                </button>
            </div>
            <div className="space-y-4">
                {suggestions.map((topic, index) => (
                    <div key={index} className="p-4 border rounded-lg bg-gray-50">
                        <h4 className="font-bold text-lg">{topic.topicName}</h4>
                        <p className="text-sm mt-1">{topic.explanation}</p>
                        <p className="text-xs mt-2 p-2 bg-blue-50 rounded"><b>Example:</b> {topic.example}</p>
                        <p className="text-xs mt-2 p-2 bg-green-50 rounded"><b>Quick Tip:</b> {topic.quickTip}</p>
                        <button onClick={() => setSelectedTopic(topic)} className="mt-3 bg-indigo-500 text-white text-sm py-1 px-3 rounded-md hover:bg-indigo-600">
                            Create Self-Assessment
                        </button>
                    </div>
                ))}
            </div>

            {selectedTopic && (
                <form onSubmit={handleGenerateQuiz} className="p-4 border-t-2 border-indigo-500 mt-6 space-y-4">
                    <h3 className="text-xl font-bold">Create Quiz for: {selectedTopic.topicName}</h3>
                     <select name="difficulty" value={quizCriteria.difficulty} onChange={handleCriteriaChange} className="w-full p-2 border rounded">{['Easy', 'Medium', 'Hard'].map(d => <option key={d}>{d}</option>)}</select>
                    <div>
                        <label className="block text-sm font-medium">Number of Questions</label>
                        <select name="numQuestions" value={quizCriteria.numQuestions} onChange={handleCriteriaChange} className="w-full p-2 border rounded mt-1">
                            {[5, 10, 15, 20].map(n => <option key={n}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="font-medium text-sm">Format</label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">{['MCQ', 'Short Answer'].map(f => (<label key={f} className="inline-flex items-center"><input type="checkbox" name="assignmentFormat" value={f} checked={quizCriteria.assignmentFormat.includes(f)} onChange={handleFormatChange} className="form-checkbox" /><span className="ml-2">{f}</span></label>))}</div>
                    </div>
                    <button type="submit" disabled={generatingQuiz} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
                        {generatingQuiz ? 'Generating Quiz...' : 'Generate Quiz'}
                    </button>
                </form>
            )}
        </div>
    );
}

// --- Quran Assignment Form ---
function QuranAssignmentForm({ student, onComplete, parentId }) {
    const [surahs, setSurahs] = useState([]);
    const [formData, setFormData] = useState({ studentId: student.id, surahNumber: '1', startAyah: '', endAyah: '', language: 'English', instructions: '', fullSurah: false });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const fetchSurahs = async () => {
            try {
                const response = await fetch('https://api.alquran.cloud/v1/surah');
                const data = await response.json();
                setSurahs(data.data);
            } catch (error) {
                console.error("Failed to fetch Surahs:", error);
            }
        };
        fetchSurahs();
    }, []);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({...prev, [name]: type === 'checkbox' ? checked : value}));
    };
    
    useEffect(() => {
        if (formData.fullSurah && formData.surahNumber) {
            const selectedSurah = surahs.find(s => s.number === parseInt(formData.surahNumber));
            if (selectedSurah) {
                setFormData(prev => ({ ...prev, startAyah: 1, endAyah: selectedSurah.numberOfAyahs }));
            }
        }
    }, [formData.fullSurah, formData.surahNumber, surahs]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await addDoc(collection(db, "quranAssignments"), {
                ...formData,
                parentId,
                status: 'Not Started',
                createdAt: serverTimestamp()
            });
            onComplete();
        } catch (error) {
            console.error("Error creating Quran assignment:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="font-medium">Student</label>
                <p className="p-2 border rounded bg-gray-100">{student.firstName} {student.lastName}</p>
            </div>
            <select name="surahNumber" value={formData.surahNumber} onChange={handleChange} className="w-full p-2 border rounded">
                {surahs.map(s => <option key={s.number} value={s.number}>{s.number}. {s.englishName} ({s.name})</option>)}
            </select>
            
            <div className="flex items-center mb-2">
                <input type="checkbox" name="fullSurah" checked={formData.fullSurah} onChange={handleChange} className="h-4 w-4 text-indigo-600" />
                <label className="ml-2 text-gray-700 text-sm">Assign Full Surah</label>
            </div>

            <div className="flex gap-4">
                <input name="startAyah" value={formData.startAyah} onChange={handleChange} placeholder="Start Ayah" type="number" className="w-full p-2 border rounded disabled:bg-gray-100" required disabled={formData.fullSurah} />
                <input name="endAyah" value={formData.endAyah} onChange={handleChange} placeholder="End Ayah" type="number" className="w-full p-2 border rounded disabled:bg-gray-100" required disabled={formData.fullSurah} />
            </div>
            <select name="language" value={formData.language} onChange={handleChange} className="w-full p-2 border rounded">
                {['English', 'Hindi', 'Urdu', 'Spanish', 'French'].map(lang => <option key={lang}>{lang}</option>)}
            </select>
            <textarea name="instructions" value={formData.instructions} onChange={handleChange} placeholder="Instructions (e.g., Memorize, Recite with Tajweed)" className="w-full p-2 border rounded" />
            <button type="submit" disabled={loading} className="w-full bg-emerald-600 text-white font-bold py-2 px-4 rounded">{loading ? 'Assigning...' : 'Assign Task'}</button>
        </form>
    );
}

// --- Quran Reader Component ---
function QuranReader({ assignment, onBack }) {
    const [ayat, setAyat] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedText, setSelectedText] = useState('');
    const [translation, setTranslation] = useState('');
    const [isTranslating, setIsTranslating] = useState(false);
    const [isMemorizing, setIsMemorizing] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [audioUrl, setAudioUrl] = useState(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const contentRef = useRef(null);

    useEffect(() => {
        const fetchAyat = async () => {
            setLoading(true);
            try {
                const response = await fetch(`https://api.alquran.cloud/v1/surah/${assignment.surahNumber}`);
                const data = await response.json();
                const verses = data.data.ayahs.slice(assignment.startAyah - 1, assignment.endAyah);
                setAyat(verses);
            } catch (error) {
                console.error("Error fetching Quran data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchAyat();
    }, [assignment]);

    const handleHighlight = () => {
        const text = window.getSelection().toString();
        if(text.trim().length > 0){
            setSelectedText(text);
        }
    };

    const handleReadAloud = () => {
        if (!selectedText) return;
        speechSynthesis.cancel(); // Stop any previous speech
        const utterance = new SpeechSynthesisUtterance(selectedText);
        utterance.lang = 'ar-SA';
        utterance.rate = 0.8; // Slower speech
        speechSynthesis.speak(utterance);
    };
    
    const handleStopAloud = () => {
        speechSynthesis.cancel();
    };

    const handleMemorizeAloud = async () => {
        if (!selectedText) return;
        setIsMemorizing(true);
        speechSynthesis.cancel();

        const prompt = `Translate the following Quranic verse into simple ${assignment.language}: "${selectedText}"`;
        try {
            const apiKey = GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            const translatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (translatedText) {
                const arabicUtterance = new SpeechSynthesisUtterance(selectedText);
                arabicUtterance.lang = 'ar-SA';
                arabicUtterance.rate = 0.8;

                const translationUtterance = new SpeechSynthesisUtterance(translatedText);
                translationUtterance.lang = 'en-US'; // Adjust if supporting other languages
                translationUtterance.rate = 0.9;

                arabicUtterance.onend = () => {
                    speechSynthesis.speak(translationUtterance);
                };
                
                speechSynthesis.speak(arabicUtterance);
            }
        } catch (error) {
            console.error("Memorization failed:", error);
        } finally {
            setIsMemorizing(false);
        }
    };

    const handleTranslate = async () => {
        if (!selectedText) return;
        setIsTranslating(true);
        const prompt = `Translate the following Quranic verse into ${assignment.language}: "${selectedText}"`;
        try {
            const apiKey = GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json();
            const translatedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            setTranslation(translatedText || "Translation not available.");
        } catch (error) {
            console.error("Translation failed:", error);
            setTranslation("Failed to translate.");
        } finally {
            setIsTranslating(false);
        }
    };
    
    const handleStartRecording = async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(audioBlob);
            setAudioUrl(audioUrl);
            audioChunksRef.current = [];
        };
        audioChunksRef.current = [];
        mediaRecorderRef.current.start();
        setIsRecording(true);
    };

    const handleStopRecording = () => {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
    };

    const handleMarkAsComplete = async () => {
        await updateDoc(doc(db, "quranAssignments", assignment.id), {
            status: 'Completed',
            completedAt: serverTimestamp()
        });
        onBack();
    };

    const handleSaveProgress = async () => {
        await updateDoc(doc(db, "quranAssignments", assignment.id), { status: 'In Progress' });
        onBack();
    };

    return (
        <div className="pb-40">
            <button onClick={onBack} className="mb-4 text-emerald-600 font-semibold">&larr; Back to Assignments</button>
            
             {/* Sticky Control Panel at Top */}
            <div className="sticky top-0 z-30 bg-white shadow-md p-4 -mx-4 sm:-mx-6 mb-6 border-b">
                 <div className="container mx-auto max-w-4xl">
                     <h3 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Interactive Tools</h3>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                            <button onClick={handleReadAloud} disabled={!selectedText} className="bg-blue-500 hover:bg-blue-600 text-white py-1.5 px-3 rounded-md disabled:bg-gray-300 text-sm font-medium shadow-sm transition-colors">Read Aloud</button>
                            <button onClick={handleTranslate} disabled={isTranslating || !selectedText} className="bg-green-500 hover:bg-green-600 text-white py-1.5 px-3 rounded-md disabled:bg-gray-300 text-sm font-medium shadow-sm transition-colors">
                                {isTranslating ? 'Translating...' : `Translate`}
                            </button>
                            <button onClick={handleMemorizeAloud} disabled={isMemorizing || !selectedText} className="bg-purple-500 hover:bg-purple-600 text-white py-1.5 px-3 rounded-md disabled:bg-gray-300 text-sm font-medium shadow-sm transition-colors">
                                {isMemorizing ? 'Processing...' : 'Memorize'}
                            </button>
                            <button onClick={handleStopAloud} className="bg-red-500 hover:bg-red-600 text-white py-1.5 px-3 rounded-md text-sm font-medium shadow-sm transition-colors">Stop Audio</button>
                        </div>

                        {/* Completion & Recording Controls */}
                        <div className="flex items-center gap-3 border-l-0 sm:border-l sm:pl-4 border-gray-300 pt-2 sm:pt-0">
                             <button onClick={handleSaveProgress} className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-1.5 px-3 rounded-md text-sm shadow-sm transition-colors">Save & Exit</button>
                            
                            {/* Always show recording or completion controls */}
                            <div className="flex items-center gap-2">
                                    {/* Check instructions for 'memorize' keyword to toggle recording UI, defaulting to show it if unsure */}
                                    {assignment.instructions?.toLowerCase().includes('memorize') || true ? (
                                        <>
                                         {!isRecording ? 
                                            <button onClick={handleStartRecording} className="bg-emerald-600 hover:bg-emerald-700 text-white py-1.5 px-3 rounded-md text-sm font-bold shadow-sm transition-colors">Start Rec</button> :
                                            <button onClick={handleStopRecording} className="bg-red-600 hover:bg-red-700 text-white py-1.5 px-3 rounded-md text-sm font-bold animate-pulse shadow-sm transition-colors">Stop Rec</button>
                                        }
                                        {audioUrl && (
                                            <button onClick={handleMarkAsComplete} className="bg-indigo-600 hover:bg-indigo-700 text-white py-1.5 px-3 rounded-md text-sm font-bold shadow-sm transition-colors">Submit</button>
                                        )}
                                        </>
                                    ) : null}
                                     <button onClick={handleMarkAsComplete} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 px-3 rounded-md text-sm shadow-sm transition-colors">Mark Complete</button>
                            </div>
                        </div>
                    </div>
                     {/* Translation Output Area */}
                    {translation && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-gray-800 text-sm animate-fade-in">
                            <strong>Translation:</strong> {translation}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-lg mb-20">
                <div className="mb-6 pb-4 border-b">
                    <h2 className="text-3xl font-bold text-gray-800">Surah {assignment.surahNumber}, Ayat {assignment.startAyah}-{assignment.endAyah}</h2>
                    <p className="text-gray-600 mt-2">{assignment.instructions}</p>
                </div>

                {loading ? <Spinner /> : (
                    <div ref={contentRef} onMouseUp={handleHighlight} className="text-right text-3xl leading-loose font-serif p-4" dir="rtl">
                        {ayat.map(ayah => <span key={ayah.number}>{ayah.text} ۝ </span>)}
                    </div>
                )}
            </div>
        </div>
    );
}

// --- AI Assignment Generation Logic ---
const generateAssignmentAI = async (student, parentId, criteria, onComplete) => {
    const pastAssignmentsQuery = query(collection(db, "assignments"), where("studentId", "==", student.id || student.uid), where("subject", "==", criteria.subject));
    const querySnapshot = await getDocs(pastAssignmentsQuery);
    const pastQuestions = [];
    querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.questions) {
            pastQuestions.push(...data.questions.map(q => q.text));
        }
    });

    const includeExplanations = ['Practice', 'Revision', 'Pre-Test'].includes(criteria.assignmentPurpose);
    const explanationPrompt = includeExplanations 
        ? `First, provide a clear, concise "explanation" of the topic suitable for the student's grade level. Then, provide an array of 2-3 "examples", where each example is an object with a "problem" and a "solution".`
        : '';
    const jsonStructure = includeExplanations
        ? `Return output as a valid JSON object with three keys: "explanation" (a string), "examples" (an array of objects), and "questions" (an array of question objects).`
        : `Return output as a valid JSON object with a single key "questions" which is an array.`;
    
    let historyInstruction = '';
    if (criteria.assignmentPurpose === 'Revision' && pastQuestions.length > 0) {
        historyInstruction = `This is a revision assignment. Rephrase or present the following past questions in a new way, but test the same underlying concepts. Do not ask the exact same questions. Past questions: ${JSON.stringify(pastQuestions)}`;
    } else if (pastQuestions.length > 0) {
        historyInstruction = `Do not repeat any of the following questions that have been asked before: ${JSON.stringify(pastQuestions)}`;
    }

    const studentProfileContext = `The student is in ${student.grade}. Strengths: ${student.strengths?.join(', ') || 'N/A'}. Weaknesses: ${student.weaknesses?.join(', ') || 'N/A'}. Learning Styles: ${student.learningStyle?.join(', ') || 'N/A'}.`;
    const assignmentContext = `Assignment Details: Subject: ${criteria.subject}. Topics: ${criteria.topics}. Purpose: ${criteria.assignmentPurpose}. Difficulty: ${criteria.difficulty}. Number of questions: ${criteria.numQuestions}.`;
    const formatInstruction = `The assignment must only contain the following question types: ${criteria.assignmentFormat.join(', ')}. For each question, the "type" field in the JSON must be one of these. If "MCQ" is a requested type, you MUST provide an "options" array and a "correctAnswer" key for that question.`;

    const prompt = `Based on this profile: ${studentProfileContext} Create an assignment with these details: ${assignmentContext}. ${formatInstruction} ${explanationPrompt} ${historyInstruction} Instructions: ${jsonStructure} Each question object in the "questions" array must have: "id", "type", "text". For MCQs, you MUST include an "options" array and a "correctAnswer" key. For other types, you do not need to. Do not include any markdown or explanatory text outside the JSON. Return ONLY valid JSON. Do not use markdown formatting. Do not include trailing commas.`;
    
    try {
        const apiKey = GEMINI_API_KEY;
        const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error(`API call failed: ${response.status}`);
        
        const result = await response.json();
        const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Invalid response from AI.");

        const generatedData = safeJsonParse(text);

        const assignmentPayload = {
            studentId: student.id || student.uid, parentId, ...criteria,
            status: 'Not Started', createdAt: serverTimestamp(),
            questions: generatedData.questions.map(q => ({ ...q, studentAnswer: '', isCorrect: null }))
        };

        if (includeExplanations) {
            assignmentPayload.explanation = generatedData.explanation || '';
            assignmentPayload.examples = generatedData.examples || [];
        }

        await addDoc(collection(db, "assignments"), assignmentPayload);
        onComplete();
    } catch (err) {
        console.error(`Failed to generate assignment. ${err.message}`);
        throw err; // Re-throw the error to be caught by the caller
    }
};

// --- AI Assignment Generator ---
function AssignmentGenerator({ student, onComplete, parentId }) {
    const initialCriteria = {
        subject: '', topics: '', curriculumStandard: 'Common Core', assignmentPurpose: 'Practice',
        assignmentFormat: [], difficulty: 'Medium', numQuestions: 10, timeLimit: 30, dueDate: '',
        autoGrading: true, showAnswers: true, showHints: false,
    };
    const [formData, setFormData] = useState(initialCriteria);
    const [templates, setTemplates] = useState([]);
    const [templateName, setTemplateName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [suggestedTopics, setSuggestedTopics] = useState([]);
    const [loadingTopics, setLoadingTopics] = useState(false);

    useEffect(() => {
        const templatesQuery = query(collection(db, "assignmentTemplates"), where("parentId", "==", parentId));
        const unsubscribe = onSnapshot(templatesQuery, (snapshot) => {
            setTemplates(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [parentId]);

    const handleTemplateSelect = (e) => {
        const selectedTemplateId = e.target.value;
        if (selectedTemplateId) {
            const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
            if (selectedTemplate) {
                setFormData({ ...initialCriteria, ...selectedTemplate.criteria });
            }
        } else {
            setFormData(initialCriteria);
        }
    };

    const handleSaveTemplate = async () => {
        if (!templateName) {
            alert("Please enter a name for the template.");
            return;
        }
        try {
            await addDoc(collection(db, "assignmentTemplates"), {
                parentId,
                name: templateName,
                criteria: formData,
                createdAt: serverTimestamp()
            });
            setTemplateName('');
            alert("Template saved successfully!");
        } catch (err) {
            console.error("Error saving template:", err);
            alert("Failed to save template.");
        }
    };
    
    const handleSuggestTopics = async () => {
        if (!formData.subject) {
            alert("Please enter a subject first.");
            return;
        }
        setLoadingTopics(true);
        const prompt = `You are an expert curriculum planner for the U.S. education system. A parent is creating an assignment for their child. Student's Grade: ${student.grade}. Subject: ${formData.subject}. Generate a list of 20-25 relevant academic topics for this subject. The list should include topics appropriate for the student's current grade level, as well as some more challenging topics from one or two grades above to help them get ahead. Return the output as a single, clean JSON object with one key: "topics". The value should be an array of strings. For example: {"topics": ["Topic 1", "Topic 2", "Advanced Topic 3"]}. Do not include any other text or markdown formatting. Return ONLY valid JSON. Do not use markdown formatting. Do not include trailing commas.`;
        try {
            const apiKey = GEMINI_API_KEY;
            const apiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: prompt }] }] };
            const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (!response.ok) throw new Error(`API call failed: ${response.status}`);
            const result = await response.json();
            const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("Invalid response from AI.");
            const data = safeJsonParse(text);
            setSuggestedTopics(data.topics || []);
        } catch (err) {
            console.error("Topic suggestion failed:", err);
        } finally {
            setLoadingTopics(false);
        }
    };

    const handleTopicClick = (topic) => {
        setFormData(prev => ({...prev, topics: prev.topics ? `${prev.topics}, ${topic}` : topic }));
    };

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    const handleCheckboxChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.checked }));
    const handleMultiSelectChange = (e) => {
        const { name, value, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: checked ? [...(prev[name] || []), value] : (prev[name] || []).filter(item => item !== value) }));
    };

    const handleGenerate = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            await generateAssignmentAI(student, parentId, formData, onComplete);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };
    
    return (
        <form onSubmit={handleGenerate} className="space-y-6">
            <div>
                <label className="font-medium">Load Criteria from Template</label>
                <select onChange={handleTemplateSelect} className="w-full p-2 border rounded mt-1">
                    <option value="">-- Select a Template --</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
            </div>

            <fieldset className="border p-4 rounded-md"><legend className="font-semibold px-2">Subject & Topic</legend><div className="space-y-4 mt-2">
                <div className="flex items-center gap-2">
                    <input name="subject" value={formData.subject} onChange={handleChange} placeholder="Subject (e.g., Math)" className="w-full p-2 border rounded" required />
                    <button type="button" onClick={handleSuggestTopics} disabled={loadingTopics} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">
                        {loadingTopics ? <Spinner /> : 'Suggest Topics'}
                    </button>
                </div>
                {suggestedTopics.length > 0 && (
                    <div className="p-2 border rounded-md bg-gray-50">
                        <p className="text-sm font-semibold mb-2">Suggested Topics:</p>
                        <div className="flex flex-wrap gap-2">
                            {suggestedTopics.map(topic => (
                                <button type="button" key={topic} onClick={() => handleTopicClick(topic)} className="bg-gray-200 text-gray-800 text-xs py-1 px-2 rounded-full hover:bg-gray-300">
                                    {topic}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <input name="topics" value={formData.topics} onChange={handleChange} placeholder="Specific Topics (comma-separated, e.g., Fractions, Decimals)" className="w-full p-2 border rounded" />
            </div></fieldset>

            <fieldset className="border p-4 rounded-md"><legend className="font-semibold px-2">Assignment Type & Format</legend><div className="space-y-4 mt-2">
                <select name="assignmentPurpose" value={formData.assignmentPurpose} onChange={handleChange} className="w-full p-2 border rounded">{['Practice', 'Pre-Test', 'Revision', 'Challenge', 'Homework'].map(p => <option key={p}>{p}</option>)}</select>
                <div><label className="font-medium text-sm">Format</label><div className="flex flex-wrap gap-x-4 gap-y-2">{['MCQ', 'Short Answer', 'Long Answer', 'Fill-in-the-Blank'].map(f => (<label key={f} className="inline-flex items-center"><input type="checkbox" name="assignmentFormat" value={f} checked={quizCriteria.assignmentFormat.includes(f)} onChange={handleMultiSelectChange} className="form-checkbox" /><span className="ml-2">{f}</span></label>))}</div></div>
            </div></fieldset>

            <fieldset className="border p-4 rounded-md"><legend className="font-semibold px-2">Difficulty & Personalization</legend><div className="space-y-4 mt-2">
                <select name="difficulty" value={formData.difficulty} onChange={handleChange} className="w-full p-2 border rounded">{['Easy', 'Medium', 'Hard'].map(d => <option key={d}>{d}</option>)}</select>
                <div>
                    <label className="block text-sm font-medium">Number of Questions</label>
                    <input type="number" min="1" max="100" name="numQuestions" value={formData.numQuestions} onChange={handleChange} className="w-full p-2 border rounded mt-1" />
                </div>
            </div></fieldset>

            <fieldset className="border p-4 rounded-md"><legend className="font-semibold px-2">Scoring Options</legend><div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="inline-flex items-center"><input type="checkbox" name="autoGrading" checked={formData.autoGrading} onChange={handleCheckboxChange} className="form-checkbox" /><span className="ml-2">Auto-Grading</span></label>
                <label className="inline-flex items-center"><input type="checkbox" name="showAnswers" checked={formData.showAnswers} onChange={handleCheckboxChange} className="form-checkbox" /><span className="ml-2">Show Answers After</span></label>
                <label className="inline-flex items-center"><input type="checkbox" name="showHints" checked={formData.showHints} onChange={handleCheckboxChange} className="form-checkbox" /><span className="ml-2">Show Hints</span></label>
            </div></fieldset>
            
            <div className="flex items-center gap-4 pt-4 border-t">
                <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="New Template Name" className="flex-grow p-2 border rounded" />
                <button type="button" onClick={handleSaveTemplate} className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded">Save Criteria</button>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded">{loading ? 'Generating...' : 'Generate & Assign'}</button>
        </form>
    );
}

export default App;
