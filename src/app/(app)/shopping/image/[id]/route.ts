import { NextResponse, type NextRequest } from "next/server";
import { ExpenseError } from "@/features/expenses/server/service";
import { MAX_IMAGE_BYTES, getImage, setImage } from "@/features/shopping/server/service";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The receipt image of a purchase. Only its owner can see or replace it. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/shopping/image/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to see this image." }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const image = await getImage(getPrisma(), user.id, id);
  if (!image) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), { headers: { "Content-Type": image.type, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: NextRequest, ctx: RouteContext<"/shopping/image/[id]">) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to upload." }, { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ ok: false, error: "That purchase could not be found." }, { status: 404 });
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose an image." }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ ok: false, error: "Choose an image under 3 MB." }, { status: 413 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    await setImage(getPrisma(), user.id, id, bytes, file.type);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ExpenseError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    console.error("[shopping] image upload failed", error);
    return NextResponse.json({ ok: false, error: "Could not save the image. Please try again." }, { status: 500 });
  }
}
