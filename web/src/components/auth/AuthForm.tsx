"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import ActivityIndicator from "@/components/indicators/activity-indicator";
import axios, { AxiosError } from "axios";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

interface UserAuthFormProps extends React.HTMLAttributes<HTMLDivElement> {}

export function UserAuthForm({ className, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  const formSchema = z.object({
    user: z.string(),
    password: z.string(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      user: "",
      password: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);

    const login = async (url: string) => {
      try {
        await axios.post(
          url,
          {
            user: values.user,
            password: values.password,
          },
          {
            headers: {
              "X-CSRF-TOKEN": 1,
            },
          }
        );

        window.location.href = "/"; // Redirect to home page after login
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const err = error as AxiosError;
          if (err.response?.status === 404 && url === "/api/login") {
            await login("/login");
          } else if (err.response?.status === 429) {
            toast.error("Exceeded rate limit. Try again later.", {
              position: "top-center",
            });
          } else if (err.response?.status === 400) {
            toast.error("Login failed", {
              position: "top-center",
            });
          } else {
            console.error("Login error:", err.response?.data);
            toast.error("Unknown error. Check logs.", {
              position: "top-center",
            });
          }
        } else {
          console.error("Login error:", error);
          toast.error("Unknown error. Check console logs.", {
            position: "top-center",
          });
        }
      } finally {
        setIsLoading(false);
      }
    };

    await login("/api/login");
  };

  return (
    <>
      <Toaster duration={2000}/>
      <div className={cn("grid gap-6", className)} {...props}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            name="user"
            render={({ field }) => (
              <FormItem className="mb-4">
                <FormLabel>Username or Email</FormLabel>
                <FormControl>
                  <Input
                    className="h-8 text-md w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                    autoFocus
                    placeholder="Enter your username or email..." 
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input
                    className="h-8 text-md w-full border border-input bg-background p-2 hover:bg-accent hover:text-accent-foreground dark:[color-scheme:dark]"
                    type="password"
                    placeholder="Enter your password..." 
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="flex flex-row gap-2 pt-5">
            <Button
              variant="select"
              disabled={isLoading}
              className="flex flex-1"
            >
              {isLoading && <ActivityIndicator className="mr-2 h-4 w-4" />}
              Login
            </Button>
          </div>
          <div className="flex justify-center pt-2">
        </div>
        </form>
      </Form>
      </div>
    </>
    
  );
}
