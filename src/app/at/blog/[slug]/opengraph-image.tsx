import { renderOgImage, ogImageSize, ogImageContentType } from "@/lib/og-image";
import { getAllPosts, getPostBySlug } from "@/content/blog";

export const size = ogImageSize;
export const contentType = ogImageContentType;

export function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  return renderOgImage(post?.title ?? "Subsumio Blog", "Blog");
}
