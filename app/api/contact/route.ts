import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validation basique
    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Email invalide' },
        { status: 400 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'contact@punkhazard.fr';
    const toEmail = process.env.RESEND_TO_EMAIL || 'contact@punkhazard.org';
    const contactSubject = subject 
      ? `[Contact] ${subject} - ${name}`
      : `[Contact] Message de ${name}`;

    // Envoi de l'email à l'administrateur
    // Le replyTo est configuré pour que vous puissiez répondre directement au client
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: email, // Permet de répondre directement au client depuis votre boîte mail
      subject: contactSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <p style="margin: 0 0 15px 0; color: #495057; font-size: 14px;">
            <strong>Nom:</strong> ${name}<br>
            <strong>Email:</strong> <a href="mailto:${email}" style="color: #0066cc; text-decoration: none;">${email}</a><br>
            ${subject ? `<strong>Sujet:</strong> ${subject}<br>` : ''}
          </p>
          <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 3px solid #0066cc;">
            <p style="margin: 0 0 8px 0; color: #212529; font-weight: 600; font-size: 14px;">Message:</p>
            <p style="margin: 0; color: #495057; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${message.replace(/\n/g, '<br>')}</p>
          </div>
        </div>
      `,
      text: `
Nouveau message de contact

Nom: ${name}
Email: ${email}
${subject ? `Sujet: ${subject}\n` : ''}

Message:
${message}
      `,
    });

    if (error) {
      console.error('Erreur Resend:', error);
      return NextResponse.json(
        { error: 'Erreur lors de l\'envoi de l\'email' },
        { status: 500 }
      );
    }

    // Envoi de l'email de confirmation au client
    const confirmationSubject = subject 
      ? `Confirmation de réception - ${subject}`
      : 'Confirmation de réception de votre message';

    const { error: confirmationError } = await resend.emails.send({
      from: fromEmail,
      to: email,
      replyTo: toEmail, // Permet au client de répondre directement à votre boîte mail
      subject: confirmationSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 2px solid #e9ecef;">
            <h2 style="margin: 0; color: #212529;">✓ Confirmation de réception</h2>
          </div>
          <div style="background: #ffffff; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">Bonjour ${name},</p>
            <p style="margin: 0 0 20px 0; color: #495057; line-height: 1.6;">
              Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.
            </p>
            ${subject ? `
            <div style="margin-bottom: 20px;">
              <p style="margin: 0; color: #495057;">
                <strong style="color: #212529; display: inline-block; min-width: 60px;">Sujet:</strong> 
                <span>${subject}</span>
              </p>
            </div>
            ` : ''}
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #0066cc; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #212529; font-weight: 600; font-size: 14px;">Votre message:</p>
              <p style="margin: 0; color: #495057; white-space: pre-wrap; line-height: 1.6;">${message.replace(/\n/g, '<br>')}</p>
            </div>
            <p style="margin: 20px 0 0 0; color: #495057; line-height: 1.6;">
              Merci de votre intérêt pour <strong>PUNKHAZARD</strong>.
            </p>
            <p style="margin: 20px 0 0 0; color: #495057;">
              Cordialement,<br>
              <strong style="color: #212529;">L'équipe PUNKHAZARD</strong>
            </p>
            <hr style="margin: 30px 0 20px 0; border: none; border-top: 1px solid #e9ecef;">
            <p style="margin: 0; color: #6c757d; font-size: 12px; line-height: 1.5;">
              Ceci est un email automatique de confirmation. Pour toute question, vous pouvez répondre directement à cet email ou nous contacter à 
              <a href="mailto:${toEmail}" style="color: #0066cc; text-decoration: none;">${toEmail}</a>
            </p>
          </div>
        </div>
      `,
      text: `
═══════════════════════════════════════════════════════════
  CONFIRMATION DE RÉCEPTION
═══════════════════════════════════════════════════════════

Bonjour ${name},

Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.

${subject ? `Sujet: ${subject}\n\n` : ''}
───────────────────────────────────────────────────────────
VOTRE MESSAGE:
───────────────────────────────────────────────────────────
${message}

───────────────────────────────────────────────────────────

Merci de votre intérêt pour PUNKHAZARD.

Cordialement,
L'équipe PUNKHAZARD

───────────────────────────────────────────────────────────
Ceci est un email automatique de confirmation. Pour toute question, vous pouvez répondre directement à cet email ou nous contacter à ${toEmail}
═══════════════════════════════════════════════════════════
      `,
    });

    if (confirmationError) {
      // On log l'erreur mais on ne fait pas échouer la requête
      // car l'email principal a été envoyé avec succès
      console.error('Erreur lors de l\'envoi de l\'email de confirmation:', confirmationError);
    }

    return NextResponse.json(
      { success: true, message: 'Message envoyé avec succès' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur API contact:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}
