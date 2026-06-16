import type { MetadataRoute } from "next";

/*
 * robots.txt. The dashboard + onboarding are behind auth — no value in
 * indexing them, and the API routes shouldn't be crawled. Allow the public
 * auth + marketing (login/signup) pages.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/login", "/signup"],
        disallow: ["/dashboard", "/onboarding", "/api"],
      },
    ],
  };
}
