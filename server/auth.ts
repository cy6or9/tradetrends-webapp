import { Express } from "express";
import { Auth } from "@auth/core";
import Google from "@auth/core/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import nodemailer from "nodemailer";
import { db } from "./db";
import { users } from "@shared/schema";

// Email verification transporter
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_FROM,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export function setupAuth(app: Express) {
  Auth({
    adapter: DrizzleAdapter(db),
    providers: [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorization: {
          params: {
            prompt: "consent",
            access_type: "offline",
            response_type: "code"
          }
        }
      })
    ],
    callbacks: {
      async session({ session, user }) {
        if (session.user) {
          session.user.id = user.id;
        }
        return session;
      },
      async signIn({ user, account, profile }) {
        if (!user.email) return false;
        
        // For email/password sign in, verify email
        if (account?.type === "credentials") {
          const dbUser = await db.query.users.findFirst({
            where: (users, { eq }) => eq(users.email, user.email)
          });
          
          if (!dbUser?.isEmailVerified) {
            // Send verification email
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationUrl = `${process.env.NEXTAUTH_URL}/verify-email?token=${verificationToken}`;
            
            await db
              .update(users)
              .set({
                verificationToken,
                verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
              })
              .where(eq(users.email, user.email));

            await transporter.sendMail({
              from: process.env.EMAIL_FROM,
              to: user.email,
              subject: "Verify your email address",
              html: `
                <p>Click the link below to verify your email address:</p>
                <p><a href="${verificationUrl}">${verificationUrl}</a></p>
                <p>This link will expire in 24 hours.</p>
              `
            });
            
            return false;
          }
        }
        
        return true;
      }
    },
    pages: {
      signIn: '/auth',
      error: '/auth/error',
      verifyRequest: '/auth/verify',
    },
    session: {
      strategy: "jwt"
    }
  });
}
