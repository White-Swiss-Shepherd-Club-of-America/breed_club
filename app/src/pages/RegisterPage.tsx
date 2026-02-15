/**
 * Registration page — creates contact + member record on first sign-in.
 */

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCurrentMember, useRegisterMember } from "@/hooks/useCurrentMember";

const registerSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(255),
  email: z.string().email().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { member } = useCurrentMember();
  const registerMutation = useRegisterMember();

  // If already registered, redirect to dashboard
  useEffect(() => {
    if (member) {
      navigate("/dashboard", { replace: true });
    }
  }, [member, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: user?.fullName || "",
      email: user?.primaryEmailAddress?.emailAddress || "",
    },
  });

  const onSubmit = async (data: RegisterForm) => {
    await registerMutation.mutateAsync(data);
    navigate("/dashboard");
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Complete Your Registration</h1>
      <p className="text-gray-600 mb-8">
        Welcome! Please confirm your details to join the club.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name
          </label>
          <input
            {...register("full_name")}
            type="text"
            id="full_name"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {errors.full_name && (
            <p className="mt-1 text-sm text-red-600">{errors.full_name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            {...register("email")}
            type="email"
            id="email"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {isSubmitting ? "Registering..." : "Register"}
        </button>

        {registerMutation.isError && (
          <p className="text-sm text-red-600">
            Registration failed. Please try again.
          </p>
        )}
      </form>
    </div>
  );
}
