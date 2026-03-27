const nodemailer = require("nodemailer");

// Create a transporter using Ethereal test credentials.
// For production, replace with your actual SMTP server details.
const transporter = nodemailer.createTransport({
    host: "sandbox.smtp.mailtrap.io",
    port: 2525,
    secure: false,
    auth: {
        user: "4f54b7c24fa0f1",
        pass: "4dbacc51132324",
    },
});
//http://localhost:3000/api/v1/auth/resetpassword/a87edf6812f235e997c7b751422e6b2f5cd95aa994c55ebeeb931ca67214d645

// Send an email using async/await;
module.exports = {
    sendMail: async function (to, url) {
        return transporter.sendMail({
            from: 'admin@hehehe.com',
            to: to,
            subject: "reset pass",
            text: "click vo day de doi pass", // Plain-text version of the message
            html: "click vo <a href=" + url + ">day</a> de doi pass", // HTML version of the message
        });
    },
    sendPasswordMail: async function (to, password) {
        return transporter.sendMail({
            from: 'admin@hehehe.com',
            to: to,
            subject: "temporary password",
            text: `Your temporary password is: ${password}. Please change it after logging in.`,
            html: `<p>Your temporary password is: <strong>${password}</strong></p><p>Please change it after logging in.</p>`,
        });
    }
}