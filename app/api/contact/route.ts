import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);
const MIN_FORM_COMPLETION_MS = 1500;
const MIN_SLIDER_VALUE = 100;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, subject, message, antiBot } = body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      antiBot?: {
        sliderValue?: number;
        honeypot?: string;
        elapsedMs?: number;
      };
    };

    const normalizedName = typeof name === 'string' ? name.trim() : '';
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedSubject = typeof subject === 'string' ? subject.trim() : '';
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    const antiBotSliderValue = Number(antiBot?.sliderValue ?? 0);
    const antiBotHoneypot = typeof antiBot?.honeypot === 'string' ? antiBot.honeypot.trim() : '';
    const antiBotElapsedMs = Number(antiBot?.elapsedMs ?? 0);

    // Validation basique
    if (!normalizedName || !normalizedEmail || !normalizedMessage) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // Vérifications anti-robot
    if (antiBotHoneypot.length > 0) {
      return NextResponse.json(
        { error: 'Validation anti-robot échouée' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(antiBotSliderValue) || antiBotSliderValue < MIN_SLIDER_VALUE) {
      return NextResponse.json(
        { error: 'Validation anti-robot échouée' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(antiBotElapsedMs) || antiBotElapsedMs < MIN_FORM_COMPLETION_MS) {
      return NextResponse.json(
        { error: 'Validation anti-robot échouée' },
        { status: 400 }
      );
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Email invalide' },
        { status: 400 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'contact@punkhazard.fr';
    const toEmail = process.env.RESEND_TO_EMAIL || 'contact@punkhazard.org';
    const contactSubject = normalizedSubject
      ? `[Contact] ${normalizedSubject} - ${normalizedName}`
      : `[Contact] Message de ${normalizedName}`;

    // Envoi de l'email à l'administrateur
    // Le replyTo est configuré pour que vous puissiez répondre directement au client
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: normalizedEmail, // Permet de répondre directement au client depuis votre boîte mail
      subject: contactSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <p style="margin: 0 0 15px 0; color: #495057; font-size: 14px;">
            <strong>Nom:</strong> ${normalizedName}<br>
            <strong>Email:</strong> <a href="mailto:${normalizedEmail}" style="color: #0066cc; text-decoration: none;">${normalizedEmail}</a><br>
            ${normalizedSubject ? `<strong>Sujet:</strong> ${normalizedSubject}<br>` : ''}
          </p>
          <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 3px solid #0066cc;">
            <p style="margin: 0 0 8px 0; color: #212529; font-weight: 600; font-size: 14px;">Message:</p>
            <p style="margin: 0; color: #495057; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${normalizedMessage.replace(/\n/g, '<br>')}</p>
          </div>
        </div>
      `,
      text: `
Nouveau message de contact

Nom: ${normalizedName}
Email: ${normalizedEmail}
${normalizedSubject ? `Sujet: ${normalizedSubject}\n` : ''}

Message:
${normalizedMessage}
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
    const confirmationSubject = normalizedSubject
      ? `Confirmation de réception - ${normalizedSubject}`
      : 'Confirmation de réception de votre message';

    const { error: confirmationError } = await resend.emails.send({
      from: fromEmail,
      to: normalizedEmail,
      replyTo: toEmail, // Permet au client de répondre directement à votre boîte mail
      subject: confirmationSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 2px solid #e9ecef;">
            <h2 style="margin: 0; color: #212529;">✓ Confirmation de réception</h2>
          </div>
          <div style="background: #ffffff; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">Bonjour ${normalizedName},</p>
            <p style="margin: 0 0 20px 0; color: #495057; line-height: 1.6;">
              Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.
            </p>
            ${normalizedSubject ? `
            <div style="margin-bottom: 20px;">
              <p style="margin: 0; color: #495057;">
                <strong style="color: #212529; display: inline-block; min-width: 60px;">Sujet:</strong> 
                <span>${normalizedSubject}</span>
              </p>
            </div>
            ` : ''}
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #0066cc; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #212529; font-weight: 600; font-size: 14px;">Votre message:</p>
              <p style="margin: 0; color: #495057; white-space: pre-wrap; line-height: 1.6;">${normalizedMessage.replace(/\n/g, '<br>')}</p>
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

Bonjour ${normalizedName},

Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.

${normalizedSubject ? `Sujet: ${normalizedSubject}\n\n` : ''}
───────────────────────────────────────────────────────────
VOTRE MESSAGE:
───────────────────────────────────────────────────────────
${normalizedMessage}

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
