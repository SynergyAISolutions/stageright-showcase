/**
 * AWS Cognito authentication helpers.
 *
 * This is a NEW integration for StageRight (content-producer uses NextAuth).
 * SDK pattern (client init, credential handling) matches content-producer.
 */
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  GetUserCommand,
  GlobalSignOutCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  type AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.APP_AWS_REGION || process.env.AWS_REGION || 'ap-southeast-2',
});

const CLIENT_ID = process.env.COGNITO_CLIENT_ID || '';

// ---------- Sign Up ----------

export async function signUp(email: string, password: string, name: string) {
  const command = new SignUpCommand({
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'name', Value: name },
    ],
  });
  return cognitoClient.send(command);
}

export async function confirmSignUp(email: string, code: string) {
  const command = new ConfirmSignUpCommand({
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
  });
  return cognitoClient.send(command);
}

export async function resendConfirmationCode(email: string) {
  const command = new ResendConfirmationCodeCommand({
    ClientId: CLIENT_ID,
    Username: email,
  });
  return cognitoClient.send(command);
}

// ---------- Sign In ----------

export async function signIn(email: string, password: string) {
  const command = new InitiateAuthCommand({
    ClientId: CLIENT_ID,
    AuthFlow: 'USER_PASSWORD_AUTH' as AuthFlowType,
    AuthParameters: {
      USERNAME: email,
      PASSWORD: password,
    },
  });
  return cognitoClient.send(command);
}

// ---------- Token Refresh ----------

export async function refreshTokens(refreshToken: string) {
  const command = new InitiateAuthCommand({
    ClientId: CLIENT_ID,
    AuthFlow: 'REFRESH_TOKEN_AUTH' as AuthFlowType,
    AuthParameters: {
      REFRESH_TOKEN: refreshToken,
    },
  });
  return cognitoClient.send(command);
}

// ---------- Get Current User ----------

export async function getCurrentUser(accessToken: string) {
  const command = new GetUserCommand({
    AccessToken: accessToken,
  });
  return cognitoClient.send(command);
}

// ---------- Sign Out ----------

export async function signOut(accessToken: string) {
  const command = new GlobalSignOutCommand({
    AccessToken: accessToken,
  });
  return cognitoClient.send(command);
}

// ---------- Password Reset ----------

export async function forgotPassword(email: string) {
  const command = new ForgotPasswordCommand({
    ClientId: CLIENT_ID,
    Username: email,
  });
  return cognitoClient.send(command);
}

export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string,
) {
  const command = new ConfirmForgotPasswordCommand({
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword,
  });
  return cognitoClient.send(command);
}
