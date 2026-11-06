import { Plus_Jakarta_Sans } from "next/font/google";
import { BrandHeader } from "@/features/auth/components/brand-header";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jakarta",
});

/**
 * Login layout. Phones and tablets: hero photo on top with the card overlapping its bottom edge.
 * Wide screens (xl): photo on the left (62.5%), the card centred in the remaining column.
 * The photos are cropped from the supplied design, so the arcs and floating tiles are part of the image.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div
      className={`${jakarta.variable} min-h-dvh bg-[#f9f9f9] text-neutral-950 xl:grid xl:grid-cols-[62.5%_minmax(0,1fr)] xl:bg-[#fefefe]`}
    >
      <div className="xl:sticky xl:top-0 xl:h-dvh xl:overflow-hidden">
        <picture>
          <source media="(min-width: 1280px)" srcSet="/auth/login-hero-desktop.webp" />
          {/* Plain <img> inside <picture>: the files are already optimised crops and only one is downloaded. */}
          <img
            src="/auth/login-hero-mobile.webp"
            alt=""
            width={1055}
            height={690}
            fetchPriority="high"
            className="block h-auto w-full xl:h-full xl:object-cover xl:object-[22%_50%]"
          />
        </picture>
      </div>

      <main className="px-0 pb-12 xl:flex xl:items-center xl:justify-center xl:py-10">
        <div className="relative mx-auto -mt-[5.5vw] w-[87%] rounded-[2.75rem] bg-white px-6 pt-8 pb-10 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.3)] sm:px-10 xl:mt-0 xl:w-[94.5%] xl:px-[clamp(2rem,2.7vw,3.2rem)] xl:pt-[clamp(2.25rem,2.8vw,3.2rem)] xl:pb-[clamp(2.25rem,2.8vw,3.2rem)]">
          <div className="mx-auto max-w-md xl:max-w-none">
            <BrandHeader />
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
