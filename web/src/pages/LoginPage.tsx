import { useState } from "react";
import { UserAuthForm } from "@/components/auth/AuthForm";
import Logo from "@/components/Logo";
import { ThemeProvider } from "@/context/theme-provider";
import ForgotPasswordDialog from "@/components/overlay/ForgotPasswordDialog"; // Import the dialog component

function LoginPage() {
  const [showForgotPasswordDialog, setShowForgotPasswordDialog] = useState(false);

  return (
    <ThemeProvider defaultTheme="system" storageKey="vigision-ui-theme">
      <div className="size-full overflow-hidden">
        <div className="p-8">
          <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
            <div className="p-6 border rounded-lg shadow-md">
              <div className="flex flex-col items-center space-y-2">
                <Logo className="mb-6 h-12 w-12" />
              </div>
              <UserAuthForm />
              <div className="flex justify-center pt-2">
                <button
                  className="text-xs hover:underline"
                  onClick={() => setShowForgotPasswordDialog(true)}
                >
                  Forgot Password?
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {showForgotPasswordDialog && (
        <ForgotPasswordDialog
          show={showForgotPasswordDialog}
          onSave={() => setShowForgotPasswordDialog(false)}
          onCancel={() => setShowForgotPasswordDialog(false)}
        />
      )}
    </ThemeProvider>
  );
}

export default LoginPage;
