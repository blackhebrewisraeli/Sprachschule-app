import { useEffect, useState } from 'react';
import { SPACE } from '../../lib/theme';
import { Stack, Row } from '../ui/Layout';
import Button from '../ui/Button';
import { Body, Meta } from '../ui/Text';
import { AdminList, AdminListRow, AdminDetail, AdminFlag } from './AdminList';
import { COMPACT_BUTTON } from './adminStyles';
import { fetchAdminUsers, setUserBlocked } from '../../lib/adminApi.js';

export default function UserList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchAdminUsers();
      setItems(payload?.items ?? []);
    } catch (err) {
      setError(err.message ?? 'Could not load users.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const payload = await fetchAdminUsers();
        if (!active) return;
        setItems(payload?.items ?? []);
      } catch (err) {
        if (!active) return;
        setError(err.message ?? 'Could not load users.');
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onBlock = async (user, blocked) => {
    if (pending !== user.userId) {
      setPending(user.userId);
      return;
    }
    setBusyId(user.userId);
    setError('');
    try {
      await setUserBlocked(user.userId, blocked);
      setPending(null);
      await load();
    } catch (err) {
      setError(err.message ?? 'Could not update block state.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack gap={4}>
      {error ? (
        <Body tone="error" style={{ overflowWrap: 'anywhere' }}>
          {error}
        </Body>
      ) : null}
      {loading ? <Meta>Loading…</Meta> : null}
      {!loading && items.length === 0 ? <Meta>No users.</Meta> : null}
      <AdminList>
        {items.map((user, index) => (
          <AdminListRow key={user.userId} first={index === 0}>
            <Row gap={3} justify="space-between" align="flex-start">
              <Body style={{ overflowWrap: 'anywhere', margin: 0 }}>
                {user.email ?? user.userId}
              </Body>
              <Row gap={3} wrap>
                {user.isAdmin ? <AdminFlag>admin</AdminFlag> : null}
                {user.isSystemAccount ? <AdminFlag>system</AdminFlag> : null}
                {user.blockedAt ? <AdminFlag tone="error">blocked</AdminFlag> : null}
              </Row>
            </Row>
            <AdminDetail>
              {user.handle ? `@${user.handle} · ` : ''}
              {user.providers?.length ? `${user.providers.join(', ')} · ` : ''}
              {user.userId}
            </AdminDetail>
            <div style={{ paddingTop: SPACE[1] }}>
              {user.isAdmin ? (
                <Meta>Admin accounts cannot be blocked.</Meta>
              ) : (
                <Button
                  variant={user.blockedAt ? 'secondary' : 'danger'}
                  style={COMPACT_BUTTON}
                  busy={busyId === user.userId}
                  onClick={() => onBlock(user, !user.blockedAt)}
                >
                  {pending === user.userId
                    ? user.blockedAt
                      ? 'Confirm unblock'
                      : 'Confirm block'
                    : user.blockedAt
                      ? 'Unblock'
                      : 'Block'}
                </Button>
              )}
            </div>
          </AdminListRow>
        ))}
      </AdminList>
    </Stack>
  );
}
