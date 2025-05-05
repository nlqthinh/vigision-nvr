import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import axios, { AxiosError } from "axios";

const emailSchema = z.string().email({ message: "Invalid email address" });

const formSchema = z.object({
  email: emailSchema,
  otp: z.string().min(6, { message: "OTP must be 6 characters long" }),
  newPassword: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .regex(/[a-z]/, { message: "Password must include at least one lowercase letter" })
    .regex(/[A-Z]/, { message: "Password must include at least one uppercase letter" })
    .regex(/[0-9]/, { message: "Password must include at least one number" })
    .regex(/[@$!%*?&#]/, { message: "Password must include at least one special character" }),
  confirmPassword: z.string().min(8, { message: "Password must be at least 8 characters long" }),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export default function ForgotPasswordDialog({ show, onSave, onCancel }) {
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isOtpSent, setIsOtpSent] = useState<boolean>(false);
  const [isOtpVerified, setIsOtpVerified] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      otp: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const checkEmailExists = async (email: string) => {
    try {
      const response = await axios.post("/api/verify_email", { email }, {
        headers: {
          "X-CSRF-TOKEN": 1,
        },
      });
      if (response.status === 200) {
        setEmailError(null);
        return true;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const err = error as AxiosError;
        if (err.response?.status === 404) {
          setEmailError("Email does not exist");
          toast.error("Email does not exist", {
            position: "top-center",
          });
        } else {
          toast.error("Error verifying email", {
            position: "top-center",
          });
        }
      } else {
        toast.error("Unexpected error verifying email", {
          position: "top-center",
        });
      }
      return false;
    }
  };

  const sendOtp = async (email: string) => {
    setIsSendingOtp(true);
    try {
      const response = await axios.post("/api/send_otp", { email }, {
        headers: {
          "X-CSRF-TOKEN": 1,
        },
      });
      if (response.status === 200) {
        setIsOtpSent(true);
        toast.success("OTP sent successfully.", {
          position: "top-center",
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const err = error as AxiosError;
        if (err.response?.status === 404) {
          await sendOtp("/send_otp");
        } else {
          toast.error(`Error sending OTP: ${err.response?.status} - ${err.response?.data.error}`, {
            position: "top-center",
          });
        }
      } else {
        toast.error("Unexpected error sending OTP.", {
          position: "top-center",
        });
      }
    } finally {
      setIsSendingOtp(false);
    }
  };

  const verifyOtp = async (email: string, otp: string) => {
    setIsLoading(true);
    try {
      const response = await axios.post("/api/verify_otp", { email, otp }, {
        headers: {
          "X-CSRF-TOKEN": 1,
        },
      });
      if (response.status === 200) {
        setIsOtpVerified(true);
        setOtpError(null);
        toast.success("OTP verified successfully.", {
          position: "top-center",
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const err = error as AxiosError;
        if (err.response?.status === 404) {
          await verifyOtp("/verify_otp");
        } else {
          setOtpError("Invalid or expired OTP");
          toast.error("Invalid or expired OTP", {
            position: "top-center",
          });
        }
      } else {
        toast.error("Unexpected error verifying OTP.", {
          position: "top-center",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async () => {
    const email = form.getValues('email');
    const emailExists = await checkEmailExists(email);
    if (emailExists) {
      await sendOtp(email);
    }
  };

  const handleVerifyOtp = async () => {
    const email = form.getValues('email');
    const otp = form.getValues('otp');
    await verifyOtp(email, otp);
  };

  const handleSave = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      const response = await axios.put("/api/update_password", {
        email: values.email,
        password: values.newPassword,
      }, {
        headers: {
          "X-CSRF-TOKEN": 1,
        },
      });
      if (response.status === 201) {
        toast.success("Password updated successfully. Redirecting to login...", {
          position: "top-center",
        });
        form.reset();
        setTimeout(() => {
          onCancel();
        }, 2000);
      } else {
        toast.error(`Unexpected response status: ${response.status}`, {
          position: "top-center",
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const err = error as AxiosError;
        if (err.response?.status === 404) {
          await handleSave("/update_password");
        } else {
          toast.error(`Error updating password: ${err.response?.status} - ${err.response?.data.error}`, {
            position: "top-center",
          });
        }
      } else {
        toast.error("Unexpected error updating password.", {
          position: "top-center",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={show} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Forgot Password</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)}>
            {!isOtpVerified && (
              <>
                <FormField
                  name="email"
                  render={({ field }) => (
                    <FormItem className="mb-4">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <Input
                            className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="select"
                            onClick={handleSendOtp}
                            className="ml-2"
                            disabled={!emailSchema.safeParse(field.value).success || isSendingOtp}
                          >
                            {isSendingOtp && <ActivityIndicator className="mr-2 h-4 w-4" />}
                            Send OTP
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                      {emailError && <p className="text-red-600 text-sm">{emailError}</p>}
                    </FormItem>
                  )}
                />
                <FormField
                  name="otp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>OTP</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                      {otpError && <p className="text-red-600 text-sm">{otpError}</p>}
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="select"
                  onClick={handleVerifyOtp}
                  className="mt-4"
                  disabled={!form.getValues('otp') || isLoading}
                >
                  {isLoading && <ActivityIndicator className="mr-2 h-4 w-4" />}
                  Verify OTP
                </Button>
              </>
            )}
            {isOtpVerified && (
              <>
                <FormField
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm New Password</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                          type="password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="mt-4">
                  <Button
                    variant="select"
                    type="submit"
                    disabled={!form.formState.isValid || isLoading}
                  >
                    {isLoading && <ActivityIndicator className="mr-2 h-4 w-4" />}
                    Update Password
                  </Button>
                </DialogFooter>
              </>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
