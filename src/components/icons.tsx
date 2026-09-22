import type { LucideProps } from "lucide-react";
import {
  Archive,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  House,
  Inbox,
  KeyRound,
  ListFilter,
  MailOpen,
  Menu,
  MoonStar,
  NotepadText,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  SunMedium,
  Trash2,
  Webhook,
  X,
} from "lucide-react";

const icon = {
  className: "size-4 shrink-0",
  strokeWidth: 1.75,
  absoluteStrokeWidth: true,
  "aria-hidden": true,
} satisfies LucideProps;

export function HomeIcon() {
  return <House {...icon} />;
}

export function InboxIcon() {
  return <Inbox {...icon} />;
}

export function FormsIcon() {
  return <NotepadText {...icon} />;
}

export function WebhooksIcon() {
  return <Webhook {...icon} />;
}

export function KeysIcon() {
  return <KeyRound {...icon} />;
}

export function SettingsIcon() {
  return <Settings {...icon} />;
}

export function MenuIcon() {
  return <Menu {...icon} />;
}

export function CloseIcon() {
  return <X {...icon} />;
}

export function SunIcon() {
  return <SunMedium {...icon} />;
}

export function MoonIcon() {
  return <MoonStar {...icon} />;
}

export function FlameIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2s3 4.2 3 7.2c0 1.5-.7 2.8-1.7 3.8.9-.3 1.7-1 2.2-1.9 1.6 2 2.5 3.8 2.5 5.4A6 6 0 0 1 12 22a6 6 0 0 1-6-5.5c0-3.4 2.4-6.2 4.2-8.7.4 1.5 1.3 2.6 1.3 2.6S12 7 12 2z" />
    </svg>
  );
}

export function SearchIcon({ className = "size-4" }: { className?: string }) {
  return <Search {...icon} className={className} />;
}

export function PlusIcon() {
  return <Plus {...icon} />;
}

export function ChevronRightIcon() {
  return <ChevronRight {...icon} />;
}

export function ChevronUpIcon() {
  return <ChevronUp {...icon} />;
}

export function ChevronDownIcon() {
  return <ChevronDown {...icon} />;
}

export function CopyIcon() {
  return <Copy {...icon} />;
}

export function CheckIcon() {
  return <Check {...icon} />;
}

export function ArchiveIcon() {
  return <Archive {...icon} />;
}

export function TrashIcon() {
  return <Trash2 {...icon} />;
}

export function MailOpenIcon() {
  return <MailOpen {...icon} />;
}

export function SpamIcon() {
  return <ShieldAlert {...icon} />;
}

export function ArrowRightIcon() {
  return <ArrowRight {...icon} />;
}

export function FilterIcon() {
  return <ListFilter {...icon} />;
}
