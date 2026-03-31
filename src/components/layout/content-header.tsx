import type { ReactNode } from "react";

export function ContentHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-8 pt-7 pb-5 bg-white border-b border-gray-200">
      <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
      {description && (
        <p className="text-[13px] text-gray-500 mt-1">{description}</p>
      )}
      {children && (
        <div className="flex gap-2 mt-4">{children}</div>
      )}
    </div>
  );
}
