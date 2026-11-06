import Image from "next/image";

/** "My Hub" wordmark with the tagline. The H mark only shows on phones, as in the design. */
export function BrandHeader() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex items-center gap-3 text-[clamp(2.25rem,10vw,3rem)] xl:text-[clamp(2.75rem,3.8vw,4.4rem)]">
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
      <p className="mt-2.5 text-base text-[#848484] sm:text-lg xl:text-[clamp(1.1rem,1.65vw,1.9rem)]">
        Track <span aria-hidden>•</span> Manage <span aria-hidden>•</span> Achieve
      </p>
    </div>
  );
}

/** Page heading inside the card, e.g. "Welcome Back". */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mt-8 text-center xl:mt-9">
      <h1 className="font-[family-name:var(--font-jakarta)] text-[1.75rem] leading-tight font-extrabold tracking-tight text-neutral-950 xl:text-[clamp(1.9rem,2.4vw,2.8rem)]">
        {title}
      </h1>
      <p className="mt-1.5 text-base text-[#848484] xl:text-[clamp(1rem,1.3vw,1.5rem)]">{subtitle}</p>
    </div>
  );
}
