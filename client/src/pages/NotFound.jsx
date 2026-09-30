import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Page not found"
      message="The page you are looking for does not exist."
      action={<Link to="/" className="btn-primary">Go to dashboard</Link>}
    />
  );
}
