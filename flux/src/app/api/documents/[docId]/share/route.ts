import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import nodemailer from "nodemailer";

export async function POST(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { docId } = await params;
    const body = await req.json();
    const { email, ownerId } = body;

    if (!docId || !email || !ownerId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    // Verify ownership before sharing
    const doc = await DocumentModel.findOneAndUpdate(
      { _id: docId, ownerId },
      { $addToSet: { sharedWith: email } },
      { new: true }
    );

    if (!doc) {
      return NextResponse.json({ error: "Document not found or unauthorized" }, { status: 404 });
    }

    // Generate test SMTP service account from ethereal.email
    let testAccount = await nodemailer.createTestAccount();

    const transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: testAccount.user, // generated ethereal user
        pass: testAccount.pass, // generated ethereal password
      },
    });

    // Send the email
    const info = await transporter.sendMail({
      from: '"Flux Editor" <no-reply@fluxeditor.app>',
      to: email,
      subject: "You've been invited to collaborate on a document!",
      text: `Hello! You have been invited to collaborate on the document "${doc.title || "Untitled"}".`,
      html: `<p>Hello!</p><p>You have been invited to collaborate on the document <b>"${doc.title || "Untitled"}"</b>.</p><p><a href="http://localhost:5174/">Open Flux Editor</a></p>`,
    });

    console.log("=========================================");
    console.log("💌 Invite email sent to: %s", email);
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    console.log("=========================================");

    return NextResponse.json({ success: true, doc, previewUrl: nodemailer.getTestMessageUrl(info) }, { status: 200 });
  } catch (error) {
    console.error("POST share document error", error);
    return NextResponse.json({ error: "Failed to share document" }, { status: 500 });
  }
}
