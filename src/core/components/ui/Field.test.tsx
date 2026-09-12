import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import Button from './Button'
import { Field, NativeSelect, TextArea, TextInput } from './Field'

describe('Button', () => {
  // A bare <button> inside a form submits it. That bug only shows up when
  // someone clicks the wrong thing, so submitting has to be asked for.
  it('does not submit the form it sits in unless asked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    const onClick = vi.fn()
    render(
      <form onSubmit={onSubmit}>
        <Button onClick={onClick}>Add line</Button>
        <Button type="submit">Save</Button>
      </form>,
    )
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    expect(onClick).toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSubmit).toHaveBeenCalled()
  })

  it('is reachable by its text, whatever the variant', () => {
    render(
      <>
        <Button variant="destructive">Deactivate</Button>
        <Button variant="subtle">Cancel</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  // A caller passing px-6 must beat the variant's px-4, not sit alongside it
  // and depend on which Tailwind emitted last.
  it('lets a caller override a utility rather than duplicating it', () => {
    render(<Button className="px-8">Wide</Button>)
    const cls = screen.getByRole('button', { name: 'Wide' }).className
    expect(cls).toContain('px-8')
    expect(cls).not.toContain('px-4')
  })

  it('cannot be clicked while disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Saving…
      </Button>,
    )
    await user.click(screen.getByRole('button', { name: 'Saving…' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Field', () => {
  // The label wraps the control rather than pairing by id. An htmlFor
  // pointing at the wrong element typechecks perfectly and is exactly what
  // made the patient chooser unreachable.
  it('names its control', () => {
    render(
      <Field label="Cell number">
        <TextInput />
      </Field>,
    )
    expect(screen.getByLabelText('Cell number')).toHaveProperty('tagName', 'INPUT')
  })

  it('names a textarea and a select the same way', () => {
    render(
      <>
        <Field label="Notes">
          <TextArea />
        </Field>
        <Field label="Method">
          <NativeSelect>
            <option value="cash">Cash</option>
          </NativeSelect>
        </Field>
      </>,
    )
    expect(screen.getByLabelText('Notes')).toHaveProperty('tagName', 'TEXTAREA')
    expect(screen.getByLabelText('Method')).toHaveProperty('tagName', 'SELECT')
  })

  it('shows an error as an alert beneath the control', () => {
    render(
      <Field label="Amount" error="Enter an amount">
        <TextInput />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount')
  })

  it('says nothing when there is no error', () => {
    render(
      <Field label="Amount">
        <TextInput />
      </Field>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('react-hook-form integration', () => {
  function Form({ onValid }: { onValid: (v: unknown) => void }) {
    const {
      register,
      handleSubmit,
      formState: { errors },
    } = useForm<{ name: string; notes: string }>({
      defaultValues: { name: '', notes: '' },
    })
    return (
      <form noValidate onSubmit={handleSubmit(onValid)}>
        <Field label="Full name" error={errors.name?.message}>
          <TextInput {...register('name', { required: 'Name is required' })} />
        </Field>
        <Field label="Notes">
          <TextArea {...register('notes')} />
        </Field>
        <Button type="submit">Save</Button>
      </form>
    )
  }

  // register() registers the field through a ref. If TextInput swallowed it,
  // every form in the app would submit empty values while looking correct —
  // which is the failure mode worth a test of its own.
  it('carries typed values through register', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Form onValid={onValid} />)
    await user.type(screen.getByLabelText('Full name'), 'Maria Clara Santos')
    await user.type(screen.getByLabelText('Notes'), 'Prefers mornings')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onValid).toHaveBeenCalled())
    expect(onValid.mock.calls[0][0]).toMatchObject({
      name: 'Maria Clara Santos',
      notes: 'Prefers mornings',
    })
  })

  it('surfaces a validation message through the field', async () => {
    const user = userEvent.setup()
    const onValid = vi.fn()
    render(<Form onValid={onValid} />)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required')
    expect(onValid).not.toHaveBeenCalled()
  })

  // A hint inside the <label> becomes part of the control's accessible name,
  // so a screen reader announces "Procedure Fills the description and the fee
  // from the price list" as though that were the field's name. It belongs
  // beside the label, not inside it.
  it('keeps the hint out of the control’s accessible name', () => {
    render(
      <Field label="Procedure" hint="Fills the description and the fee from the price list.">
        <TextInput />
      </Field>,
    )
    expect(screen.getByLabelText('Procedure')).toBeInTheDocument()
    expect(screen.getByText(/fills the description/i)).toBeInTheDocument()
  })

  it('keeps the error message out of it too', () => {
    render(
      <Field label="Amount" error="An amount must be more than zero.">
        <TextInput />
      </Field>,
    )
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    expect(screen.getByText(/more than zero/i)).toBeInTheDocument()
  })
})
