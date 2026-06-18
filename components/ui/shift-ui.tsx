import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftIcon } from "@/components/icons";

export {
  ArrowLeftIcon,
  BadgeIcon,
  BuildingIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  DownloadIcon,
  FileTextIcon,
  KeyIcon,
  LogOutIcon,
  LogoutIcon,
  MailIcon,
  PlusIcon,
  SearchIcon,
  UserCircleIcon,
  UserPlusIcon,
  UsersIcon,
} from "@/components/icons";

type CardProps = {
  children: ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <section
      className={[
        "rounded-xl border border-black/10 bg-white shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </section>
  );
}

export function IconBadge({
  children,
  className = "bg-[#ececf0] text-[#030213]",
}: CardProps) {
  return (
    <div
      className={[
        "flex h-12 w-12 items-center justify-center rounded-lg",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function BackHeader({
  backHref = "/admin",
  backLabel = "戻る",
  right,
}: {
  backHref?: string;
  backLabel?: string;
  right?: ReactNode;
}) {
  return (
    <header className="border-b border-black/10 bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1248px] items-center justify-between px-4 py-4 sm:px-6 lg:px-0">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition hover:bg-[#e9ebef]"
        >
          <ArrowLeftIcon />
          {backLabel}
        </Link>
        {right}
      </div>
    </header>
  );
}

export function TextInput({
  id,
  label,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm shadow-sm outline-none transition placeholder:text-[#717182] focus:border-[#030213]"
      />
    </div>
  );
}
