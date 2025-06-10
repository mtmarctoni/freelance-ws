import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { Resend } from 'npm:resend@4.0.1';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  projectType: string;
  budget?: string;
  timeline?: string;
  message: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }

  try {
    const formData: ContactFormData = await req.json();

    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.projectType || !formData.message) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    // Store the contact form submission in Supabase (optional)
    const { error: dbError } = await supabase
      .from('contact_submissions')
      .insert({
        first_name: formData.firstName,
        last_name: formData.lastName,
        email: formData.email,
        company: formData.company,
        project_type: formData.projectType,
        budget: formData.budget,
        timeline: formData.timeline,
        message: formData.message,
        submitted_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Database error:', dbError);
      // Continue with email sending even if DB fails
    }

    // Send email to you (notification)
    const notificationEmail = await resend.emails.send({
      from: 'contact@marctoni.dev', // Use your verified domain
      to: ['marctonimas@outlook.es'],
      subject: `New Contact Form Submission from ${formData.firstName} ${formData.lastName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">New Contact Form Submission</h2>
          
          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Contact Information</h3>
            <p><strong>Name:</strong> ${formData.firstName} ${formData.lastName}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            ${formData.company ? `<p><strong>Company:</strong> ${formData.company}</p>` : ''}
          </div>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Project Details</h3>
            <p><strong>Project Type:</strong> ${formData.projectType}</p>
            ${formData.budget ? `<p><strong>Budget:</strong> ${formData.budget}</p>` : ''}
            ${formData.timeline ? `<p><strong>Timeline:</strong> ${formData.timeline}</p>` : ''}
          </div>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Message</h3>
            <p style="white-space: pre-wrap;">${formData.message}</p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px;">
              This email was sent from your portfolio contact form at ${new Date().toLocaleString()}.
            </p>
          </div>
        </div>
      `,
    });

    // Send confirmation email to the user
    const confirmationEmail = await resend.emails.send({
      from: 'contact@marctoni.dev', // Use your verified domain
      to: [formData.email],
      subject: 'Thank you for contacting Marc Toni Mas',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">Thank you for your message!</h2>
          
          <p>Hi ${formData.firstName},</p>
          
          <p>Thank you for reaching out! I've received your message about your <strong>${formData.projectType.toLowerCase()}</strong> project and I'm excited to learn more about it.</p>
          
          <div style="background-color: #f0f9ff; padding: 20px; border-radius: 8px; border-left: 4px solid #2563eb; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">What happens next?</h3>
            <ul style="color: #1e40af;">
              <li>I'll review your project details carefully</li>
              <li>You'll hear back from me within 24 hours</li>
              <li>We can schedule a call to discuss your project in detail</li>
            </ul>
          </div>

          <p>In the meantime, feel free to check out my <a href="https://marctoni.dev/#portfolio" style="color: #2563eb;">recent projects</a> to get a better sense of my work.</p>
          
          <p>Looking forward to potentially working together!</p>
          
          <p>Best regards,<br>
          <strong>Marc Toni Mas</strong><br>
          Full-Stack Developer & Web3 Specialist<br>
          <a href="mailto:marctonimas@outlook.es" style="color: #2563eb;">marctonimas@outlook.es</a></p>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
            <p style="color: #64748b; font-size: 14px;">
              This is an automated confirmation email. If you have any immediate questions, feel free to reply directly to this email.
            </p>
          </div>
        </div>
      `,
    });

    if (notificationEmail.error || confirmationEmail.error) {
      console.error('Email sending error:', notificationEmail.error || confirmationEmail.error);
      return new Response(
        JSON.stringify({ error: 'Failed to send email' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent successfully',
        notificationId: notificationEmail.data?.id,
        confirmationId: confirmationEmail.data?.id
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});