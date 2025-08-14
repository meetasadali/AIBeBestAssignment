const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { Resend } = require("resend");

admin.initializeApp();

// Initialize Resend with your API key from Firebase config
const resend = new Resend(functions.config().resend.apikey);

const ADMIN_EMAIL = "your-admin-email@example.com"; // CHANGE THIS
const FROM_EMAIL = "notifications@your-verified-domain.com"; // CHANGE THIS to your verified domain

// 1. Notify Admin on new parent signup
exports.notifyAdminOnParentSignup = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap) => {
    const newUser = snap.data();
    if (newUser.role === "parent" && newUser.status === "pending") {
      try {
        await resend.emails.send({
          from: `AI Assignment Hub <${FROM_EMAIL}>`,
          to: ADMIN_EMAIL,
          subject: "New Parent Signup for Approval",
          html: `<p>A new parent has signed up: <b>${newUser.email}</b>. Please log in to the admin dashboard to approve them.</p>`,
        });
        console.log("Approval notification sent to admin.");
      } catch (error) {
        console.error("Error sending email via Resend:", error);
      }
    }
    return null;
  });

// 2. Notify Student when an assignment is created
exports.notifyStudentOnNewAssignment = functions.firestore
  .document("assignments/{assignmentId}")
  .onCreate(async (snap) => {
    const assignment = snap.data();
    const studentDoc = await admin.firestore().collection("students").doc(assignment.studentId).get();
    if (!studentDoc.exists) return null;
    
    const studentData = studentDoc.data();
    try {
      await resend.emails.send({
        from: `AI Assignment Hub <${FROM_EMAIL}>`,
        to: studentData.email,
        subject: `New Assignment: ${assignment.subject}`,
        html: `<p>Hi ${studentData.firstName},</p><p>A new assignment, "${assignment.topic}" in ${assignment.subject}, has been assigned to you.</p>`,
      });
      console.log(`New assignment notification sent to ${studentData.email}.`);
    } catch (error) {
      console.error("Error sending email via Resend:", error);
    }
    return null;
  });

// 3. Notify Parent when an assignment is completed
exports.notifyParentOnAssignmentCompletion = functions.firestore
  .document("assignments/{assignmentId}")
  .onUpdate(async (change) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.status !== "Completed" && after.status === "Completed") {
      const parentDoc = await admin.firestore().collection("users").doc(after.parentId).get();
      const studentDoc = await admin.firestore().collection("students").doc(after.studentId).get();
      if (!parentDoc.exists || !studentDoc.exists) return null;

      const parentEmail = parentDoc.data().email;
      const studentName = studentDoc.data().firstName;

      try {
        await resend.emails.send({
          from: `AI Assignment Hub <${FROM_EMAIL}>`,
          to: parentEmail,
          subject: `${studentName} has completed an assignment!`,
          html: `<p>Hi,</p><p>${studentName} has completed the assignment "${after.topic}" in ${after.subject}.</p><p><b>Score:</b> ${after.score}%</p><p><b>AI Suggestion:</b> ${after.aiSuggestion}</p>`,
        });
        console.log(`Completion notification sent to ${parentEmail}.`);
      } catch (error) {
        console.error("Error sending email via Resend:", error);
      }
    }
    return null;
  });
