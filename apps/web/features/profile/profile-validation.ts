export const NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 255;
export const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateName(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Name is required";
  }

  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Name must be ${NAME_MAX_LENGTH} characters or less`;
  }

  return null;
}

export function validateEmail(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Email is required";
  }

  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return `Email must be ${EMAIL_MAX_LENGTH} characters or less`;
  }

  if (!EMAIL_PATTERN.test(trimmed)) {
    return "Enter a valid email address";
  }

  return null;
}

export function validateAvatar(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "Profile picture must be an image file";
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    return "Profile picture must be 2 MB or smaller";
  }

  return null;
}
