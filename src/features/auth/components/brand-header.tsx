import Image from "next/image";

/** "My Hub" wordmark with the tagline. The H mark only shows on phones, as in the design. */
export function BrandHeader() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-3 text-[clamp(1.75rem,8vw,2.25rem)] xl:text-[2.25rem]">
        <Image
          src="/auth/hub-logo.png"
          alt=""
          width={146}
          height={100}
          unoptimized
          priority
          className="h-[1.2em] w-auto xl:hidden"
        />
        <span className="font-[family-name:var(--font-jakarta)] leading-none font-extrabold tracking-tight text-neutral-950">
          My Hub
        </span>
      </div>
      <p className="mt-2 text-sm text-[#848484] xl:text-sm">
        Track <span aria-hidden>•</span> Manage <span aria-hidden>•</span> Achieve
      </p>
    </div>
  );
}

/** Page heading inside the card, e.g. "Welcome Back". */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mt-6 text-center xl:mt-6">
      <h1 className="font-[family-name:var(--font-jakarta)] text-[1.4rem] leading-tight font-extrabold tracking-tight text-neutral-950 xl:text-[1.4rem]">
        {title}
      </h1>
      <p className="mt-1 text-sm text-[#848484] xl:text-sm">{subtitle}</p>
    </div>
  );
}
