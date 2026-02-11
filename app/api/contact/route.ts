import { Resend } from 'resend';
import { NextRequest, NextResponse } from 'next/server';

const resend = new Resend(process.env.RESEND_API_KEY);
const MIN_FORM_COMPLETION_MS = 1500;
const MIN_SLIDER_VALUE = 100;
type SupportedLocale = 'fr' | 'en';

type LocalizedCopy = {
  errors: {
    required: string;
    antiBot: string;
    invalidEmail: string;
    sendEmail: string;
    server: string;
  };
  successMessage: string;
  admin: {
    newMessageTitle: string;
    nameLabel: string;
    emailLabel: string;
    subjectLabel: string;
    messageLabel: string;
    subjectWithTopic: (subject: string, name: string) => string;
    subjectWithoutTopic: (name: string) => string;
  };
  confirmation: {
    subjectWithTopic: (subject: string) => string;
    subjectWithoutTopic: string;
    heading: string;
    greeting: (name: string) => string;
    intro: string;
    messageLabel: string;
    thanks: string;
    signoff: string;
    team: string;
    autoReplyNoticeHtml: string;
    autoReplyNoticeText: (email: string) => string;
    textHeader: string;
  };
};

const COPY: Record<SupportedLocale, LocalizedCopy> = {
  fr: {
    errors: {
      required: 'Tous les champs sont requis',
      antiBot: 'Validation anti-robot échouée',
      invalidEmail: 'Email invalide',
      sendEmail: 'Erreur lors de l\'envoi de l\'email',
      server: 'Erreur serveur',
    },
    successMessage: 'Message envoyé avec succès',
    admin: {
      newMessageTitle: 'Nouveau message de contact',
      nameLabel: 'Nom',
      emailLabel: 'Email',
      subjectLabel: 'Sujet',
      messageLabel: 'Message',
      subjectWithTopic: (subject, name) => `[Contact] ${subject} - ${name}`,
      subjectWithoutTopic: (name) => `[Contact] Message de ${name}`,
    },
    confirmation: {
      subjectWithTopic: (subject) => `Confirmation de réception - ${subject}`,
      subjectWithoutTopic: 'Confirmation de réception de votre message',
      heading: '✓ Confirmation de réception',
      greeting: (name) => `Bonjour ${name},`,
      intro: 'Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.',
      messageLabel: 'Votre message',
      thanks: 'Merci de votre intérêt pour PUNKHAZARD.',
      signoff: 'Cordialement,',
      team: 'L\'équipe PUNKHAZARD',
      autoReplyNoticeHtml:
        'Ceci est un email automatique de confirmation. Pour toute question, vous pouvez répondre directement à cet email ou nous contacter à',
      autoReplyNoticeText: (email) =>
        `Ceci est un email automatique de confirmation. Pour toute question, vous pouvez répondre directement à cet email ou nous contacter à ${email}`,
      textHeader: 'CONFIRMATION DE RÉCEPTION',
    },
  },
  en: {
    errors: {
      required: 'All required fields must be completed',
      antiBot: 'Anti-bot verification failed',
      invalidEmail: 'Invalid email address',
      sendEmail: 'Error while sending email',
      server: 'Server error',
    },
    successMessage: 'Message sent successfully',
    admin: {
      newMessageTitle: 'New contact message',
      nameLabel: 'Name',
      emailLabel: 'Email',
      subjectLabel: 'Subject',
      messageLabel: 'Message',
      subjectWithTopic: (subject, name) => `[Contact] ${subject} - ${name}`,
      subjectWithoutTopic: (name) => `[Contact] Message from ${name}`,
    },
    confirmation: {
      subjectWithTopic: (subject) => `Confirmation of receipt - ${subject}`,
      subjectWithoutTopic: 'Confirmation of receipt for your message',
      heading: '✓ Confirmation of receipt',
      greeting: (name) => `Hello ${name},`,
      intro: 'We have received your message and will get back to you as soon as possible.',
      messageLabel: 'Your message',
      thanks: 'Thank you for your interest in PUNKHAZARD.',
      signoff: 'Best regards,',
      team: 'The PUNKHAZARD team',
      autoReplyNoticeHtml:
        'This is an automatic confirmation email. If you have any questions, you can reply directly to this email or contact us at',
      autoReplyNoticeText: (email) =>
        `This is an automatic confirmation email. If you have any questions, you can reply directly to this email or contact us at ${email}`,
      textHeader: 'CONFIRMATION OF RECEIPT',
    },
  },
};

function normalizeLocale(locale?: string): SupportedLocale {
  if (!locale) {
    return 'fr';
  }

  return locale.toLowerCase().startsWith('en') ? 'en' : 'fr';
}

export async function POST(request: NextRequest) {
  let localeKey: SupportedLocale = 'fr';

  try {
    const body = await request.json();
    const { name, email, subject, message, locale, antiBot } = body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      locale?: string;
      antiBot?: {
        sliderValue?: number;
        honeypot?: string;
        elapsedMs?: number;
      };
    };

    localeKey = normalizeLocale(locale);
    const copy = COPY[localeKey];

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
        { error: copy.errors.required },
        { status: 400 }
      );
    }

    // Vérifications anti-robot
    if (antiBotHoneypot.length > 0) {
      return NextResponse.json(
        { error: copy.errors.antiBot },
        { status: 400 }
      );
    }

    if (!Number.isFinite(antiBotSliderValue) || antiBotSliderValue < MIN_SLIDER_VALUE) {
      return NextResponse.json(
        { error: copy.errors.antiBot },
        { status: 400 }
      );
    }

    if (!Number.isFinite(antiBotElapsedMs) || antiBotElapsedMs < MIN_FORM_COMPLETION_MS) {
      return NextResponse.json(
        { error: copy.errors.antiBot },
        { status: 400 }
      );
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: copy.errors.invalidEmail },
        { status: 400 }
      );
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'contact@punkhazard.fr';
    const toEmail = process.env.RESEND_TO_EMAIL || 'contact@punkhazard.org';
    const contactSubject = normalizedSubject
      ? copy.admin.subjectWithTopic(normalizedSubject, normalizedName)
      : copy.admin.subjectWithoutTopic(normalizedName);

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
            <strong>${copy.admin.nameLabel}:</strong> ${normalizedName}<br>
            <strong>${copy.admin.emailLabel}:</strong> <a href="mailto:${normalizedEmail}" style="color: #0066cc; text-decoration: none;">${normalizedEmail}</a><br>
            ${normalizedSubject ? `<strong>${copy.admin.subjectLabel}:</strong> ${normalizedSubject}<br>` : ''}
          </p>
          <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 3px solid #0066cc;">
            <p style="margin: 0 0 8px 0; color: #212529; font-weight: 600; font-size: 14px;">${copy.admin.messageLabel}:</p>
            <p style="margin: 0; color: #495057; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${normalizedMessage.replace(/\n/g, '<br>')}</p>
          </div>
        </div>
      `,
      text: `
${copy.admin.newMessageTitle}

${copy.admin.nameLabel}: ${normalizedName}
${copy.admin.emailLabel}: ${normalizedEmail}
${normalizedSubject ? `${copy.admin.subjectLabel}: ${normalizedSubject}\n` : ''}

${copy.admin.messageLabel}:
${normalizedMessage}
      `,
    });

    if (error) {
      console.error('Erreur Resend:', error);
      return NextResponse.json(
        { error: copy.errors.sendEmail },
        { status: 500 }
      );
    }

    // Envoi de l'email de confirmation au client
    const confirmationSubject = normalizedSubject
      ? copy.confirmation.subjectWithTopic(normalizedSubject)
      : copy.confirmation.subjectWithoutTopic;

    const { error: confirmationError } = await resend.emails.send({
      from: fromEmail,
      to: normalizedEmail,
      replyTo: toEmail, // Permet au client de répondre directement à votre boîte mail
      subject: confirmationSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 2px solid #e9ecef;">
            <h2 style="margin: 0; color: #212529;">${copy.confirmation.heading}</h2>
          </div>
          <div style="background: #ffffff; padding: 20px; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 15px 0; color: #495057; font-size: 16px;">${copy.confirmation.greeting(normalizedName)}</p>
            <p style="margin: 0 0 20px 0; color: #495057; line-height: 1.6;">
              ${copy.confirmation.intro}
            </p>
            ${normalizedSubject ? `
            <div style="margin-bottom: 20px;">
              <p style="margin: 0; color: #495057;">
                <strong style="color: #212529; display: inline-block; min-width: 60px;">${copy.admin.subjectLabel}:</strong> 
                <span>${normalizedSubject}</span>
              </p>
            </div>
            ` : ''}
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #0066cc; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #212529; font-weight: 600; font-size: 14px;">${copy.confirmation.messageLabel}:</p>
              <p style="margin: 0; color: #495057; white-space: pre-wrap; line-height: 1.6;">${normalizedMessage.replace(/\n/g, '<br>')}</p>
            </div>
            <p style="margin: 20px 0 0 0; color: #495057; line-height: 1.6;">
              ${copy.confirmation.thanks}
            </p>
            <p style="margin: 20px 0 0 0; color: #495057;">
              ${copy.confirmation.signoff}<br>
              <strong style="color: #212529;">${copy.confirmation.team}</strong>
            </p>
            <hr style="margin: 30px 0 20px 0; border: none; border-top: 1px solid #e9ecef;">
            <p style="margin: 0; color: #6c757d; font-size: 12px; line-height: 1.5;">
              ${copy.confirmation.autoReplyNoticeHtml} 
              <a href="mailto:${toEmail}" style="color: #0066cc; text-decoration: none;">${toEmail}</a>
            </p>
          </div>
        </div>
      `,
      text: `
${copy.confirmation.textHeader}

${copy.confirmation.greeting(normalizedName)}

${copy.confirmation.intro}

${normalizedSubject ? `${copy.admin.subjectLabel}: ${normalizedSubject}\n` : ''}
${copy.confirmation.messageLabel}:
${normalizedMessage}

${copy.confirmation.thanks}

${copy.confirmation.signoff}
${copy.confirmation.team}

${copy.confirmation.autoReplyNoticeText(toEmail)}
      `,
    });

    if (confirmationError) {
      // On log l'erreur mais on ne fait pas échouer la requête
      // car l'email principal a été envoyé avec succès
      console.error('Erreur lors de l\'envoi de l\'email de confirmation:', confirmationError);
    }

    return NextResponse.json(
      { success: true, message: copy.successMessage },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erreur API contact:', error);
    const copy = COPY[localeKey];

    return NextResponse.json(
      { error: copy.errors.server },
      { status: 500 }
    );
  }
}
