// Global "Users & Access" page. All logic lives in the shared <UsersAndAccess/> component
// (src/components/UsersAndAccess.tsx), which the customer-detail "Users & access" tab also
// renders (scoped to one workspace) so the two never drift.
import { UsersAndAccess } from '../components/UsersAndAccess';

export default function UsersAdmin() {
  return <UsersAndAccess />;
}
