import { Navigate, useParams } from "react-router-dom";

/**
 * Where `/registers/:slug/access` used to be a page of its own. It is now the
 * register's Access & settings tab; this keeps old links and bookmarks working.
 */
export default function RegisterAccess() {
  const { slug } = useParams<{ slug: string }>();
  return <Navigate to={`/registers/${slug}?tab=access`} replace />;
}
