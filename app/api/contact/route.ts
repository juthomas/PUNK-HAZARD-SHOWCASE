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
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 2px solid #e9ecef;">
            <h2 style="margin: 0; color: #212529;">📧 Nouveau message de contact</h2>
          </div>
          <div style="background: #ffffff; padding: 20px; border-radius: 0 0 8px 8px;">
            <div style="margin-bottom: 20px;">
              <p style="margin: 8px 0; color: #495057;">
                <strong style="color: #212529; display: inline-block; min-width: 80px;">Nom:</strong> 
                <span>${name}</span>
              </p>
              <p style="margin: 8px 0; color: #495057;">
                <strong style="color: #212529; display: inline-block; min-width: 80px;">Email:</strong> 
                <a href="mailto:${email}" style="color: #0066cc; text-decoration: none;">${email}</a>
              </p>
              ${subject ? `
              <p style="margin: 8px 0; color: #495057;">
                <strong style="color: #212529; display: inline-block; min-width: 80px;">Sujet:</strong> 
                <span>${subject}</span>
              </p>
              ` : ''}
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #0066cc; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #212529; font-weight: 600;">Message:</p>
              <p style="margin: 0; color: #495057; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 12px;">
              <p style="margin: 0;">💡 <strong>Astuce:</strong> Cliquez sur "Répondre" dans votre client email pour répondre directement à ${name} (${email})</p>
            </div>
          </div>
        </div>
      `,
      text: `
═══════════════════════════════════════════════════════════
  NOUVEAU MESSAGE DE CONTACT
═══════════════════════════════════════════════════════════

Nom: ${name}
Email: ${email}
${subject ? `Sujet: ${subject}\n` : ''}

───────────────────────────────────────────────────────────
MESSAGE:
───────────────────────────────────────────────────────────
${message}

───────────────────────────────────────────────────────────
💡 Astuce: Répondez à cet email pour répondre directement à ${name} (${email})
═══════════════════════════════════════════════════════════
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
      subject: confirmationSubject,
      html: `
        <h2>Confirmation de réception</h2>
        <p>Bonjour ${name},</p>
        <p>Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.</p>
        ${subject ? `<p><strong>Sujet:</strong> ${subject}</p>` : ''}
        <p><strong>Votre message:</strong></p>
        <p style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          ${message.replace(/\n/g, '<br>')}
        </p>
        <p>Merci de votre intérêt pour PUNKHAZARD.</p>
        <p>Cordialement,<br>L'équipe PUNKHAZARD</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
        <p style="color: #666; font-size: 12px;">
          Ceci est un email automatique, merci de ne pas y répondre directement.<br>
          Pour nous contacter, utilisez le formulaire sur notre site ou écrivez à ${toEmail}
        </p>
      `,
      text: `
Confirmation de réception

Bonjour ${name},

Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.

${subject ? `Sujet: ${subject}\n` : ''}
Votre message:
${message}

Merci de votre intérêt pour PUNKHAZARD.

Cordialement,
L'équipe PUNKHAZARD

---
Ceci est un email automatique, merci de ne pas y répondre directement.
Pour nous contacter, utilisez le formulaire sur notre site ou écrivez à ${toEmail}
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
