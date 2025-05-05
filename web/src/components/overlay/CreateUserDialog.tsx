import { Button } from "../ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import ActivityIndicator from "../indicators/activity-indicator";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { toast } from "sonner";
import axios from "axios";

type CreateUserOverlayProps = {
  show: boolean;
  onCreate: (user: string, password: string, email: string, otp: string, resetForm: () => void) => void;
  onCancel: () => void;
};

export default function CreateUserDialog({
  show,
  onCreate,
  onCancel,
}: CreateUserOverlayProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSendingOtp, setIsSendingOtp] = useState<boolean>(false);
  const [isValidEmail, setIsValidEmail] = useState<boolean>(false);

  const formSchema = z.object({
    user: z
      .string()
      .min(6, { message: "Username must be at least 6 characters long" })
      .max(30, { message: "Username must be no more than 30 characters long" })
      .regex(/^[A-Za-z0-9._]+$/, {
        message: "Username may only include letters, numbers, . or _",
      }),
    password: z
      .string()
      .min(8, { message: "Password must be at least 8 characters long" })
      .max(30, { message: "Password must be no more than 30 characters long" })
      .regex(/[a-z]/, { message: "Password must include at least one lowercase letter" })
      .regex(/[A-Z]/, { message: "Password must include at least one uppercase letter" })
      .regex(/[0-9]/, { message: "Password must include at least one number" })
      .regex(/[@$!%*?&#]/, { message: "Password must include at least one special character" }),
    email: z
      .string()
      .email({ message: "Invalid email address" }),
    otp: z.string().min(6, { message: "OTP must be 6 characters long" }),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      user: "",
      password: "",
      email: "",
      otp: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      await onCreate(values.user, values.password, values.email, values.otp, () => form.reset());
      // form.reset();
    } catch (error) {
      // Handle error if necessary
    } finally {
      setIsLoading(false);
    }
  };

  const validateEmail = (email: string) => {
    const emailSchema = z.string().email();
    try {
      emailSchema.parse(email);
      setIsValidEmail(true);
    } catch {
      setIsValidEmail(false);
    }
  };

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

  useEffect(() => {
    validateEmail(form.watch("email"));
  }, [form.watch("email")]);

  return (
    <Dialog open={show} onOpenChange={onCancel}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              name="user"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold	text-primary">User</FormLabel>
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
            <FormField
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold	text-primary">Password</FormLabel>
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
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold	text-primary">Email</FormLabel>
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
                        disabled={!isValidEmail || isSendingOtp}
                      >
                        {isSendingOtp && <ActivityIndicator className="mr-2 h-4 w-4" />}
                        Send OTP
                      </Button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="otp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="font-bold	text-primary">OTP</FormLabel>
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
                Create User
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}