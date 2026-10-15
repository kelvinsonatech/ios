import Link from "next/link";
import { ActivityIcon, HomeIcon } from "lucide-react";
import { Container } from "@/components/public/section";
import { StatusMessage, pillOutline, pillPrimary } from "@/components/public/status-message";

/** 404 inside the public layout (unknown protocol, country or server slugs). */
export default function PublicNotFound() {
  return (
    <Container>
      <StatusMessage
        code="404"
        title="We couldn't find that page"
        description="The server or location may have been renamed or retired. Pick a protocol from the home page or check the live server list."
      >
        <Link href="/" className={pillPrimary}>
          <HomeIcon />
          Back to home
        </Link>
        <Link href="/server-status" className={pillOutline}>
          <ActivityIcon />
          Server status
        </Link>
      </StatusMessage>
    </Container>
  );
}
