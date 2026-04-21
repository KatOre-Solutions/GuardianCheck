import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

async function testSmtp() {
  console.log("Testing SMTP Connection...");
  console.log("Host:", process.env.SMTP_HOST);
  console.log("Port:", process.env.SMTP_PORT);
  console.log("User:", process.env.SMTP_USER);
  console.log("Secure:", process.env.SMTP_SECURE);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.ethereal.email",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "mock_user",
      pass: process.env.SMTP_PASS || "mock_pass",
    },
  });

  try {
    await transporter.verify();
    console.log("✅ Success: SMTP connection is valid.");
  } catch (error: any) {
    console.error("❌ Failed: SMTP connection failed.");
    console.error("Error Code:", error.code);
    console.error("Error Message:", error.message);
    if (error.command) console.log("Command:", error.command);
    if (error.response) console.log("Response:", error.response);
  }
}

testSmtp();
