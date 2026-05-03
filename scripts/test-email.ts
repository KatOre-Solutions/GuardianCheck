import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

async function testResend() {
  console.log("Testing Resend Connection...");
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.error("❌ Failed: RESEND_API_KEY not found in .env");
    return;
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: "GuardianCheck Test <notifications@guardiancheck.co.za>",
      to: "delivered@resend.dev",
      subject: "Test Email from Resend",
      html: "<strong>If you see this, Resend is working!</strong>",
    });

    if (error) {
      console.error("❌ Failed: Resend returned an error.");
      console.error(error);
    } else {
      console.log("✅ Success: Resend email sent successfully.");
      console.log("ID:", data?.id);
    }
  } catch (error: any) {
    console.error("❌ Failed: Unexpected error.");
    console.error(error.message);
  }
}

testResend();
