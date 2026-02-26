/**
 * Embeddable membership application form — designed for iframe use.
 * No Layout wrapper (no nav/sidebar/header).
 * Includes reCAPTCHA and postMessage height reporting for auto-resize.
 */

import { useState, useEffect, useRef } from "react";
import { MembershipForm } from "@/components/MembershipForm";
import { useClub } from "@/hooks/useClub";
import { api, ApiRequestError } from "@/lib/api";

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;

export function EmbedApplyPage() {
  const { data: clubData } = useClub();
  const club = clubData?.club;
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaContainerRef = useRef<HTMLDivElement>(null);

  // Load reCAPTCHA v2 script and render widget
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;

    const scriptId = "recaptcha-script";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://www.google.com/recaptcha/api.js";
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    // Render widget once script is ready
    const tryRender = () => {
      if (
        (window as any).grecaptcha &&
        recaptchaContainerRef.current &&
        !recaptchaContainerRef.current.hasChildNodes()
      ) {
        (window as any).grecaptcha.render(recaptchaContainerRef.current, {
          sitekey: RECAPTCHA_SITE_KEY,
          callback: (token: string) => setRecaptchaToken(token),
          "expired-callback": () => setRecaptchaToken(null),
        });
      }
    };

    const interval = setInterval(() => {
      if ((window as any).grecaptcha?.render) {
        tryRender();
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, []);

  // postMessage to parent for iframe auto-resize
  useEffect(() => {
    const sendHeight = () => {
      window.parent.postMessage(
        { type: "breed-club-form-height", height: document.body.scrollHeight },
        "*"
      );
    };
    sendHeight();
    const observer = new ResizeObserver(sendHeight);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, [submitted]);

  const handleSubmit = async (payload: Parameters<typeof MembershipForm>[0]["onSubmit"] extends (p: infer P) => any ? P : never) => {
    try {
      setSubmitError(null);
      setIsSubmitting(true);
      await api.post("/public/applications", payload);
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 409) {
        setSubmitError("An application with this email address is already pending review.");
      } else if (error instanceof ApiRequestError) {
        setSubmitError(error.error?.message || "Failed to submit application. Please try again.");
      } else {
        setSubmitError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-white p-6">
        <div className="max-w-lg mx-auto text-center py-12">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Application Submitted</h1>
          <p className="text-gray-600">
            Thank you for your interest in joining {club?.name || "our club"}! A board member will
            review your application and follow up via email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white">
      <div className="max-w-lg mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Apply for Membership</h1>
        <p className="text-gray-600 mb-6">
          Submit your application to join {club?.name || "the club"}. A board member will review
          your application and follow up via email.
        </p>

        <MembershipForm
          onSubmit={handleSubmit}
          recaptchaToken={recaptchaToken}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />

        {/* reCAPTCHA widget */}
        {RECAPTCHA_SITE_KEY && (
          <div className="mt-4">
            <div ref={recaptchaContainerRef} />
            {!recaptchaToken && (
              <p className="mt-1 text-xs text-gray-500">
                Please complete the reCAPTCHA above before submitting.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
