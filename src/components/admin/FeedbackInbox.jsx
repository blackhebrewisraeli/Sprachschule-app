import { useEffect, useState } from 'react';
import { SPACE } from '../../lib/theme';
import { Stack, Row } from '../ui/Layout';
import Button from '../ui/Button';
import { Body, Meta } from '../ui/Text';
import { AdminFilterRail } from './AdminRail';
import { AdminList, AdminListRow, AdminDetail, AdminFlag } from './AdminList';
import { COMPACT_BUTTON } from './adminStyles';
import { deleteFeedback, fetchFeedback, updateFeedbackStatus } from '../../lib/adminApi.js';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'handled', label: 'Handled' },
];

export default function FeedbackInbox() {
  const [status, setStatus] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = async (nextStatus = status) => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchFeedback(nextStatus || undefined);
      setItems(payload?.items ?? []);
    } catch (err) {
      setError(err.message ?? 'Could not load feedback.');
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
        const payload = await fetchFeedback();
        if (!active) return;
        setItems(payload?.items ?? []);
      } catch (err) {
        if (!active) return;
        setError(err.message ?? 'Could not load feedback.');
        setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onFilter = (key) => {
    setStatus(key);
    setPendingDelete(null);
    void load(key);
  };

  const onStatus = async (id, next) => {
    setBusyId(id);
    setError('');
    try {
      await updateFeedbackStatus(id, next);
      await load(status);
    } catch (err) {
      setError(err.message ?? 'Could not update feedback.');
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id) => {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    setBusyId(id);
    setError('');
    try {
      await deleteFeedback(id);
      setPendingDelete(null);
      await load(status);
    } catch (err) {
      setError(err.message ?? 'Could not delete feedback.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Stack gap={4}>
      <AdminFilterRail
        options={FILTERS}
        activeKey={status}
        onPick={onFilter}
        ariaLabel="Filter reports"
      />
      {error ? (
        <Body tone="error" style={{ overflowWrap: 'anywhere' }}>
          {error}
        </Body>
      ) : null}
      {loading ? <Meta>Loading…</Meta> : null}
      {!loading && items.length === 0 ? <Meta>No reports.</Meta> : null}
      <AdminList>
        {items.map((row, index) => (
          <AdminListRow key={row.id} first={index === 0}>
            <Row gap={2} justify="space-between" align="flex-start">
              <AdminFlag tone={row.status === 'handled' ? 'muted' : 'default'}>
                {row.status} · {row.category}
              </AdminFlag>
              <AdminFlag>
                {row.created_at ? new Date(row.created_at).toLocaleString() : ''}
              </AdminFlag>
            </Row>
            <Body style={{ overflowWrap: 'anywhere', margin: 0 }}>{row.message}</Body>
            <AdminDetail>
              {[row.surface, row.cefr_level, row.deck_id, row.item_id].filter(Boolean).join(' · ')}
              {row.item_label ? ` · ${row.item_label}` : ''}
              {row.user_id ? ` · ${row.user_id}` : ' · guest'}
            </AdminDetail>
            <Row gap={2} wrap style={{ paddingTop: SPACE[1] }}>
              <Button
                variant="secondary"
                style={COMPACT_BUTTON}
                busy={busyId === row.id}
                onClick={() => onStatus(row.id, row.status === 'handled' ? 'open' : 'handled')}
              >
                {row.status === 'handled' ? 'Reopen' : 'Mark handled'}
              </Button>
              <Button
                variant="danger"
                style={COMPACT_BUTTON}
                busy={busyId === row.id}
                onClick={() => onDelete(row.id)}
              >
                {pendingDelete === row.id ? 'Confirm delete' : 'Delete'}
              </Button>
            </Row>
          </AdminListRow>
        ))}
      </AdminList>
    </Stack>
  );
}
