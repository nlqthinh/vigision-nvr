import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import axios from "axios";
import { toast } from "sonner";
import ActivityIndicator from "../indicators/activity-indicator";
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
} from "../ui/form";

type SetEmailProps = {
  show: boolean;
  onSave: (newEmail: string, otp: string, resetForm: () => void) => void;
  onCancel: () => void;
  username: string;
  currentEmail: string;
};

const emailSchema = z.string().email({ message: "Invalid email address" });

const formSchema = z.object({
  email: emailSchema,
  otp: z.string().min(6, { message: "OTP must be 6 characters long" }),
});

export default function SetEmailDialog({
  show,
  onSave,
  onCancel,
  username,
  currentEmail,
}: SetEmailProps) {
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      otp: "",
    },
  });

  const sendOtp = async (email: string) => {
    setIsSendingOtp(true);
    try {
      await axios.post("/send_otp", { email });
      toast.success("OTP sent successfully.", {
        position: "top-center",
      });
    } catch (error) {
      toast.error("Error sending OTP. Check server logs.", {
        position: "top-center",
      });
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleSave = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      const response = await axios.post("/verify_email", { email: values.email });
      if (response.status === 404) {
        onSave(values.email, values.otp, () => form.reset());
      } else if (response.status === 200) {
        setEmailError("Email already exists.");
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          onSave(values.email, values.otp, () => form.reset());
        } else if (error.response?.data?.message === "Email already exists") {
          setEmailError("Email already exists.");
        } else {
          toast.error("Error updating email. Check server logs.", {
            position: "top-center",
          });
        }
      } else {
        toast.error("Unexpected error. Check server logs.", {
          position: "top-center",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };
  

  useEffect(() => {
    setEmailError(null);
  }, [form.watch("email")]);

  return (
    <Dialog open={show} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Email</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSave)}>
            <FormField
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Email</FormLabel>
                  <FormControl>
                    <div className="flex">
                      <Input
                        className="w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                        {...field}
                      />
                      <Button
                        variant="select"
                        onClick={() => sendOtp(field.value)}
                        className="ml-2"
                        disabled={!emailSchema.safeParse(field.value).success || isSendingOtp || field.value === currentEmail}
                      >
                        {isSendingOtp && <ActivityIndicator className="mr-2 h-4 w-4" />}
                        Send OTP
                      </Button>
                    </div>
                  </FormControl>
                  {field.value === currentEmail && <p className="text-red-600">New email must be different from the current email.</p>}
                  {emailError && <p className="text-red-600">{emailError}</p>}
                  <FormMessage />
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
                </FormItem>
              )}
            />
            <DialogFooter className="mt-4">
              <Button
                variant="select"
                disabled={!form.formState.isValid || isLoading}
              >
                {isLoading && <ActivityIndicator className="mr-2 h-4 w-4" />}
                Update Email
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}