import { notFound } from "next/navigation";

/**
 * Any address under a language that no page handles: shows CRYPY's own "not found" page (with the site's header,
 * navigation and a 404 status) instead of the framework's bare default.
 */
export default function MissingPage(): never {
  notFound();
}
