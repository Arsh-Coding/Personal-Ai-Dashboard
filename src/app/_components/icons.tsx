import type { SVGProps } from "react";

/**
 * Inline stroke icons (Lucide geometry), so the UI needs no icon dependency.
 *
 * Sized by the 16px `width`/`height` attributes unless a class says otherwise:
 * a `size-*` class overrides presentation attributes, so `<MailIcon
 * className="size-5" />` just works. Decorative by default; pass `aria-label`
 * and `aria-hidden={false}` when an icon carries meaning on its own.
 *
 * No hooks and no "use client", so server components can use them too.
 */
type IconProps = SVGProps<SVGSVGElement>;

function icon(name: string, paths: React.ReactNode) {
  function Icon(props: IconProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={16}
        height={16}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        {...props}
        className={`shrink-0 ${props.className ?? ""}`}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const SunIcon = icon(
  "SunIcon",
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </>,
);
export const MoonIcon = icon("MoonIcon", <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />);
export const MonitorIcon = icon(
  "MonitorIcon",
  <>
    <rect width="20" height="14" x="2" y="3" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </>,
);
export const RefreshIcon = icon(
  "RefreshIcon",
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </>,
);
export const PlusIcon = icon("PlusIcon", <path d="M5 12h14M12 5v14" />);
export const MailIcon = icon(
  "MailIcon",
  <>
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </>,
);
export const CalendarIcon = icon(
  "CalendarIcon",
  <>
    <rect width="18" height="18" x="3" y="4" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </>,
);
export const VideoIcon = icon(
  "VideoIcon",
  <>
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </>,
);
export const ClockIcon = icon(
  "ClockIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>,
);
export const SearchIcon = icon(
  "SearchIcon",
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const ChevronLeftIcon = icon("ChevronLeftIcon", <path d="m15 18-6-6 6-6" />);
export const ChevronRightIcon = icon("ChevronRightIcon", <path d="m9 18 6-6-6-6" />);
export const ChevronDownIcon = icon("ChevronDownIcon", <path d="m6 9 6 6 6-6" />);
export const XIcon = icon("XIcon", <path d="M18 6 6 18M6 6l12 12" />);
export const SparklesIcon = icon(
  "SparklesIcon",
  <>
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
    <path d="M20 3v4M22 5h-4M4 17v2M5 18H3" />
  </>,
);
export const SendIcon = icon(
  "SendIcon",
  <>
    <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
    <path d="m21.854 2.147-10.94 10.939" />
  </>,
);
export const CheckIcon = icon("CheckIcon", <path d="M20 6 9 17l-5-5" />);
export const CheckCircleIcon = icon(
  "CheckCircleIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const AlertTriangleIcon = icon(
  "AlertTriangleIcon",
  <>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
    <path d="M12 9v4M12 17h.01" />
  </>,
);
export const AlertCircleIcon = icon(
  "AlertCircleIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </>,
);
export const InfoIcon = icon(
  "InfoIcon",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);
export const InboxIcon = icon(
  "InboxIcon",
  <>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>,
);
export const LogOutIcon = icon(
  "LogOutIcon",
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </>,
);
export const PaperclipIcon = icon(
  "PaperclipIcon",
  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
);
export const NoteIcon = icon(
  "NoteIcon",
  <>
    <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z" />
    <path d="M15 3v4a2 2 0 0 0 2 2h4" />
  </>,
);
export const CopyIcon = icon(
  "CopyIcon",
  <>
    <rect width="14" height="14" x="8" y="8" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </>,
);
export const ArrowUpRightIcon = icon("ArrowUpRightIcon", <path d="M7 7h10v10M7 17 17 7" />);
export const ArrowRightIcon = icon("ArrowRightIcon", <path d="M5 12h14M12 5l7 7-7 7" />);
export const StopIcon = icon("StopIcon", <rect width="12" height="12" x="6" y="6" rx="2" />);
export const ShieldIcon = icon(
  "ShieldIcon",
  <>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const LockIcon = icon(
  "LockIcon",
  <>
    <rect width="18" height="11" x="3" y="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </>,
);
export const UserIcon = icon(
  "UserIcon",
  <>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </>,
);
export const ResetIcon = icon(
  "ResetIcon",
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>,
);
export const ImageIcon = icon(
  "ImageIcon",
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </>,
);
export const ComposeIcon = icon(
  "ComposeIcon",
  <>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
  </>,
);
export const TrendingIcon = icon(
  "TrendingIcon",
  <>
    <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
    <path d="M16 7h6v6" />
  </>,
);
export const LinkIcon = icon(
  "LinkIcon",
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>,
);

/** The app's mark: a gradient tile with a spark. */
export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-brand via-fuchsia-500 to-brand-2 text-white shadow-[0_6px_18px_-6px_var(--ui-brand)] ${className}`}
    >
      <span className="absolute inset-0 bg-linear-to-t from-black/10 to-white/20" />
      <SparklesIcon className="relative size-[55%]" strokeWidth={2} />
    </span>
  );
}

/** Google's "G", for the sign-in button. Brand colors, so not `currentColor`. */
export function GoogleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
