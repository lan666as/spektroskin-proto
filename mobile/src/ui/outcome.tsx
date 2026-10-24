import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text } from 'react-native';

import { api, type CaseDetail, type CaseSummary, type OutcomeIn } from '@/api/client';

import { Button, Card, Chips, ErrorBanner, Field, Heading, KeyValue, Muted, Row } from './components';
import { formatDate } from './labels';
import { colors } from './theme';

type Action = OutcomeIn['action_taken'];
type Histo = NonNullable<OutcomeIn['histopathology']>;

export const OUTCOME_LABELS: Record<Action, string> = {
  observed: 'Observed',
  biopsied: 'Biopsy taken',
  excised: 'Excised',
  referred: 'Referred',
  declined: 'Patient declined',
};
export const HISTO_LABELS: Record<Histo, string> = {
  pending: 'Result pending',
  benign: 'Benign',
  malignant: 'Malignant',
  indeterminate: 'Indeterminate',
};
const TISSUE: Action[] = ['biopsied', 'excised'];
const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

const today = () => new Date().toISOString().slice(0, 10);

/** What still needs doing on an answered case, for the clinician's home list; null if nothing. */
export function nextStep(c: CaseSummary, now = new Date()): string | null {
  if (c.status !== 'answered') return null;
  if (!c.outcome_action) return 'Record what was done';
  if (c.histopathology === 'pending') return 'Histopathology result pending';
  if (c.follow_up_due) {
    const days = Math.round((new Date(c.follow_up_due).getTime() - now.getTime()) / 86_400_000);
    if (days <= 7) return days < 0 ? `Follow-up overdue since ${formatDate(c.follow_up_due)}` : `Follow-up due ${formatDate(c.follow_up_due)}`;
  }
  return null;
}

/**
 * Closes the loop after the recommendation: what the treating clinician did and, after a biopsy
 * or excision, the histopathology result. Entered by people; no automated output here.
 */
export function OutcomeCard({ c, editable }: { c: CaseDetail; editable: boolean }) {
  const queryClient = useQueryClient();
  const o = c.outcome;
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<Action | null>(o?.action_taken ?? null);
  const [date, setDate] = useState(o?.procedure_date ?? today());
  const [histo, setHisto] = useState<Histo>(o?.histopathology ?? 'pending');
  const [notes, setNotes] = useState(o?.histopathology_notes ?? '');
  const save = useMutation({
    mutationFn: () => {
      const tissue = !!action && TISSUE.includes(action);
      return api.recordOutcome(c.id, {
        action_taken: action!,
        procedure_date: date.trim() || null,
        histopathology: tissue ? histo : null,
        histopathology_notes: tissue && notes.trim() ? notes.trim() : null,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['case', c.id], updated);
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      setEditing(false);
    },
  });

  if (c.status !== 'answered') return null;
  if (o && !editing) {
    return (
      <Card testID="outcome-summary">
        <Heading>Outcome</Heading>
        <KeyValue label="Action taken" value={OUTCOME_LABELS[o.action_taken]} />
        {o.procedure_date ? <KeyValue label="Date" value={formatDate(o.procedure_date)} /> : null}
        {o.histopathology ? (
          <KeyValue
            label="Histopathology"
            value={<Text testID="outcome-histopathology">{HISTO_LABELS[o.histopathology]}</Text>}
          />
        ) : null}
        {o.histopathology_notes ? <Muted>Report: {o.histopathology_notes}</Muted> : null}
        <Muted>
          Recorded by {o.recorded_by_name} · {formatDate(o.updated_at)}
        </Muted>
        {editable ? (
          <Button label="Update outcome" variant="secondary" onPress={() => setEditing(true)} testID="edit-outcome" />
        ) : null}
      </Card>
    );
  }
  if (!editable) {
    return (
      <Card testID="outcome-missing">
        <Heading>Outcome</Heading>
        <Muted>Not recorded yet by the requesting clinician.</Muted>
      </Card>
    );
  }
  const tissue = !!action && TISSUE.includes(action);
  return (
    <Card testID="outcome-form" style={{ borderColor: colors.accent }}>
      <Heading>What happened next?</Heading>
      <Muted>Closes the loop for this lesion. Biopsy results become the labels future validation needs.</Muted>
      <Chips label="Action taken" options={options(OUTCOME_LABELS)} value={action} onChange={setAction} testIDPrefix="outcome-action" />
      <Field label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" testID="outcome-date" />
      {tissue ? (
        <>
          <Chips label="Histopathology" options={options(HISTO_LABELS)} value={histo} onChange={setHisto} testIDPrefix="histo" />
          <Field
            label="Report summary (optional, no names)"
            value={notes}
            onChangeText={setNotes}
            placeholder="e.g. compound naevus, margins clear"
            testID="outcome-notes"
          />
        </>
      ) : null}
      <ErrorBanner error={save.error} />
      <Row>
        <Button label="Save outcome" onPress={() => save.mutate()} disabled={!action || save.isPending} testID="save-outcome" />
        {editing ? <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} /> : null}
      </Row>
      {!action ? <Text style={{ color: colors.textMuted }}>Choose what was done to save.</Text> : null}
    </Card>
  );
}
