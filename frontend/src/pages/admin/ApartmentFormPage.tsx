import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useBlocker, useNavigate, useParams } from 'react-router';

import {
  deleteImage,
  fetchAdminApartment,
  reorderImages,
  uploadImage,
  useAdminApartment,
  useDeleteApartment,
  useRefreshListing,
  useSaveApartment,
} from '@/api/admin';
import { useDistricts } from '@/api/catalog';
import { ApiError } from '@/api/client';
import type { AdminApartment, Image } from '@/api/types';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TrashIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/toastContext';
import { adminErrorMessage, missingFieldsLabel } from '@/features/admin/errors';
import { FormSection, SelectField, TextAreaField, TextField } from '@/features/admin/form/fields';
import { LocationSection } from '@/features/admin/form/LocationSection';
import {
  fromImages,
  type PhotoItem,
  photosChanged,
  releasePreviews,
} from '@/features/admin/form/photoDraft';
import { PhotoEditor } from '@/features/admin/form/PhotoManager';
import {
  apartmentSchema,
  type ApartmentFormValues,
  EMPTY_VALUES,
  fromApartment,
  SERVER_FIELD_MAP,
  toInput,
} from '@/features/admin/form/schema';
import { StatusActions } from '@/features/admin/StatusActions';
import { StatusBadge } from '@/features/admin/StatusBadge';
import { TelegramPanel } from '@/features/admin/telegram/TelegramPanel';
import { districtName, formatPriceFull } from '@/lib/format';
import { setClosingConfirmation } from '@/telegram/webapp';

const ROOM_OPTIONS = Array.from({ length: 11 }, (_, n) => n);

function StatusPanel({ apartment }: { apartment: AdminApartment }) {
  const { t } = useTranslation();
  return (
    <section
      className="border-line bg-bg space-y-4 rounded-2xl border p-4 lg:p-6"
      aria-label={t('admin.form.statusLabel')}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{t('admin.form.statusLabel')}</span>
        <StatusBadge status={apartment.status} />
      </div>
      <p className={`text-sm ${apartment.missing_fields.length ? 'text-amber-600' : 'text-hint'}`}>
        {apartment.missing_fields.length
          ? t('admin.form.missing', { fields: missingFieldsLabel(t, apartment.missing_fields) })
          : t('admin.form.ready')}
      </p>
      <StatusActions apartmentId={apartment.id} status={apartment.status} />
    </section>
  );
}

/**
 * Route entry. Keyed by listing id: `/new` and `/:id` share this component, and without a
 * key React would reuse the instance after "save draft" redirects, carrying over its state.
 */
export function ApartmentFormRoute() {
  const { id } = useParams();
  return <ApartmentFormPage key={id ?? 'new'} id={id} />;
}

function ApartmentFormPage({ id }: { id: string | undefined }) {
  const isNew = !id;
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  const navigate = useNavigate();
  const toast = useToast();
  const districts = useDistricts();
  const apartment = useAdminApartment(id);
  const save = useSaveApartment(id);
  const remove = useDeleteApartment();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<ApartmentFormValues>({
    resolver: zodResolver(apartmentSchema),
    defaultValues: EMPTY_VALUES,
  });
  const { register, handleSubmit, control, reset, setError, setValue, formState } = form;
  const { errors, isDirty: fieldsDirty, isSubmitting } = formState;

  // Photos are edited like any other field: added, reordered and removed locally, and
  // applied when the form is saved (for new listings right after the draft is created).
  const refreshListing = useRefreshListing();
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState<{ current: number; total: number } | null>(null);
  const savedImages = apartment.data?.images;
  const photosDirty = isNew ? photos.length > 0 : photosChanged(photos, savedImages ?? []);
  const isDirty = fieldsDirty || photosDirty;

  // Load the listing into the form once (later refetches must not overwrite edits).
  const loadedId = useRef<string | null>(null);
  useEffect(() => {
    if (apartment.data && loadedId.current !== apartment.data.id) {
      loadedId.current = apartment.data.id;
      reset(fromApartment(apartment.data));
      setPhotos(fromImages(apartment.data.images));
    }
  }, [apartment.data, reset]);

  // Unsaved-changes protection: in-app navigation, page unload and closing the Mini App.
  // After saving or deleting, `redirectTo` lets the follow-up navigation through.
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  useEffect(() => {
    setClosingConfirmation(isDirty);
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      setClosingConfirmation(false);
    };
  }, [isDirty]);
  const blocker = useBlocker(isDirty && redirectTo === null);
  // Must run after useBlocker: the router updates its blocker in an effect, and effects
  // run in declaration order, so navigating earlier would still see the old "dirty" state.
  useEffect(() => {
    if (redirectTo && !isDirty) void navigate(redirectTo, { replace: true });
  }, [redirectTo, isDirty, navigate]);

  const leaveTo = (path: string) => {
    reset(undefined, { keepValues: true });
    releasePreviews(photos);
    setPhotos([]);
    setRedirectTo(path);
  };

  /** Upload new photos, delete removed ones, then apply the edited order. */
  const syncPhotos = async (apartmentId: string, original: Image[]) => {
    const fresh = photos.flatMap((item) => (item.kind === 'new' ? [item] : []));
    const uploadedIds = new Map<string, string>();
    let failed = 0;
    const fail = (name: string, error: unknown) => {
      failed += 1;
      toast(t('admin.photos.rejected', { name, reason: adminErrorMessage(t, error) }), 'error');
    };

    for (const [index, item] of fresh.entries()) {
      setUploading({ current: index + 1, total: fresh.length });
      try {
        const image = await uploadImage(apartmentId, item.file, (fraction) => {
          setUploadProgress((current) => ({ ...current, [item.key]: fraction }));
        });
        uploadedIds.set(item.key, image.id);
      } catch (error) {
        fail(item.file.name, error);
      }
    }
    setUploading(null);
    setUploadProgress({});

    const kept = new Set(photos.flatMap((item) => (item.kind === 'saved' ? [item.image.id] : [])));
    for (const [index, image] of original.entries()) {
      if (kept.has(image.id)) continue;
      try {
        await deleteImage(apartmentId, image.id);
      } catch (error) {
        fail(t('admin.photos.photoAlt', { index: index + 1 }), error);
      }
    }

    let server = await fetchAdminApartment(apartmentId);
    const serverIds = server.images.map((image) => image.id);
    const wanted = photos.flatMap((item) =>
      item.kind === 'saved' ? [item.image.id] : (uploadedIds.get(item.key) ?? []),
    );
    // Photos that couldn't be removed stay, after the requested ones.
    const order = [
      ...wanted.filter((id) => serverIds.includes(id)),
      ...serverIds.filter((id) => !wanted.includes(id)),
    ];
    if (order.join() !== serverIds.join()) {
      await reorderImages(apartmentId, order);
      server = await fetchAdminApartment(apartmentId);
    }
    releasePreviews(photos);
    return { server, uploaded: uploadedIds.size, failed };
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      let result = apartment.data;
      if (isNew || fieldsDirty || !result) result = await save.mutateAsync(toInput(values));
      let uploaded = 0;
      if (photosDirty) {
        const synced = await syncPhotos(result.id, isNew ? [] : (savedImages ?? []));
        result = synced.server;
        uploaded = synced.uploaded;
        refreshListing(result);
      }
      reset(fromApartment(result));
      setPhotos(fromImages(result.images));
      toast(isNew ? t('admin.form.created') : t('admin.form.saved'));
      if (uploaded > 0) toast(t('admin.photos.uploaded', { count: uploaded }));
      if (isNew) leaveTo(`/admin/apartments/${result.id}`);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'validation_error') {
        const details = Array.isArray(error.details) ? (error.details as { loc: unknown[] }[]) : [];
        for (const detail of details) {
          const field = SERVER_FIELD_MAP[String(detail.loc.at(-1))];
          if (field) setError(field, { message: 'validation.invalid' });
        }
      }
      toast(adminErrorMessage(t, error), 'error');
    }
  });

  const price = useWatch({ control, name: 'price' });
  const contactType = useWatch({ control, name: 'agent_contact_type' });

  if (!isNew && apartment.isPending) {
    return (
      <div className="text-hint flex justify-center py-24">
        <Spinner />
      </div>
    );
  }
  if (!isNew && apartment.isError) {
    return (
      <p role="alert" className="px-4 py-16 text-center">
        {adminErrorMessage(t, apartment.error)}
      </p>
    );
  }

  const roomOptions = (studio: boolean) => [
    { value: '', label: t('admin.form.choose') },
    ...ROOM_OPTIONS.map((n) => ({
      value: String(n),
      label: n === 0 && studio ? t('apartment.studio') : String(n),
    })),
  ];
  const errorText = (message: string | undefined) =>
    message ? t(message, { defaultValue: message }) : null;

  return (
    <form
      noValidate
      onSubmit={(event) => void onSubmit(event)}
      className="mx-auto max-w-7xl space-y-4 px-4 pt-5 pb-[calc(6rem+var(--safe-bottom))] lg:px-10"
    >
      <h2 className="text-2xl font-semibold">
        {isNew ? t('admin.form.newTitle') : t('admin.form.editTitle')}
      </h2>

      {apartment.data && (
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <StatusPanel apartment={apartment.data} />
          <TelegramPanel apartmentId={apartment.data.id} status={apartment.data.status} />
        </div>
      )}

      {/* Desktop: two columns of tiles; phones: one column in reading order. */}
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
          <FormSection title={t('admin.form.sections.basics')}>
            <TextField
              label={t('admin.form.title')}
              placeholder={t('admin.form.titlePlaceholder')}
              error={errors.title}
              {...register('title')}
            />
            <TextField
              label={t('admin.form.price')}
              inputMode="numeric"
              autoComplete="off"
              error={errors.price}
              hint={
                price && /^\d+$/.test(price) ? formatPriceFull(Number(price), language) : undefined
              }
              {...register('price', {
                setValueAs: (value: string) => value.replace(/[^\d]/g, ''),
              })}
            />
            <SelectField
              label={t('admin.form.district')}
              error={errors.district_id}
              options={[
                { value: '', label: t('admin.form.choose') },
                ...(districts.data ?? []).map((d) => ({
                  value: String(d.id),
                  label: districtName(d, language),
                })),
              ]}
              {...register('district_id')}
            />
            <div className="grid grid-cols-2 items-end gap-3">
              <SelectField
                label={t('admin.form.bedrooms')}
                error={errors.bedrooms}
                options={roomOptions(true)}
                {...register('bedrooms')}
              />
              <SelectField
                label={t('admin.form.bathrooms')}
                error={errors.bathrooms}
                options={roomOptions(false)}
                {...register('bathrooms')}
              />
            </div>
            <TextField
              label={t('admin.form.area')}
              inputMode="decimal"
              error={errors.area}
              {...register('area')}
            />
          </FormSection>

          <LocationSection
            control={control}
            register={register}
            address={
              <TextField
                label={t('admin.form.address')}
                error={errors.address}
                {...register('address')}
              />
            }
            locationError={errorText(errors.location?.message)}
            precisionError={errorText(errors.location_precision?.message)}
            onPickResult={(result) => {
              setValue(
                'location',
                { latitude: result.latitude, longitude: result.longitude },
                { shouldDirty: true },
              );
              // A searched place (often a street or district) is never claimed to be exact.
              setValue('location_precision', 'approximate', { shouldDirty: true });
            }}
          />

          <FormSection title={t('admin.form.sections.photos')}>
            <PhotoEditor
              photos={photos}
              onChange={setPhotos}
              progress={uploadProgress}
              busy={isSubmitting}
            />
          </FormSection>
        </div>
        <div className="space-y-4">
          <FormSection title={t('admin.form.sections.terms')}>
            <div className="grid grid-cols-2 items-end gap-3">
              <TextField
                label={t('admin.form.deposit')}
                inputMode="numeric"
                error={errors.deposit}
                {...register('deposit', {
                  setValueAs: (value: string) => value.replace(/[^\d]/g, ''),
                })}
              />
              <TextField
                label={t('admin.form.minMonths')}
                inputMode="numeric"
                error={errors.minimum_rental_months}
                {...register('minimum_rental_months')}
              />
            </div>
            <TextAreaField
              label={t('admin.form.conditions')}
              error={errors.rental_conditions}
              {...register('rental_conditions')}
            />
          </FormSection>

          <FormSection title={t('admin.form.sections.details')}>
            <TextAreaField
              label={t('admin.form.description')}
              rows={6}
              error={errors.description}
              {...register('description')}
            />
          </FormSection>

          <FormSection title={t('admin.form.sections.contact')}>
            <SelectField
              label={t('admin.form.contactType')}
              error={errors.agent_contact_type}
              options={[
                { value: '', label: t('admin.form.contactNone') },
                ...(['telegram_username', 'telegram_link', 'phone'] as const).map((type) => ({
                  value: type,
                  label: t(`admin.form.contactTypes.${type}`),
                })),
              ]}
              {...register('agent_contact_type')}
            />
            {contactType && (
              <TextField
                label={t('admin.form.contactValue')}
                placeholder={t(`admin.form.contactPlaceholders.${contactType}`)}
                autoCapitalize="off"
                autoCorrect="off"
                error={errors.agent_contact_value}
                {...register('agent_contact_value')}
              />
            )}
            <p className="text-hint text-sm">{t('admin.form.adminContactNote')}</p>
          </FormSection>

          {apartment.data && (
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(true);
              }}
              className="text-danger flex min-h-11 w-full items-center justify-center gap-2 rounded-xl font-semibold"
            >
              <TrashIcon />
              {t('admin.form.delete')}
            </button>
          )}
        </div>
      </div>

      <div className="border-line bg-bg fixed inset-x-0 bottom-0 z-10 border-t px-4 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">
        <div className="mx-auto max-w-7xl lg:flex lg:justify-end lg:px-6">
          <button
            type="submit"
            disabled={isSubmitting || (!isNew && !isDirty)}
            className="bg-accent text-accent-fg min-h-12 w-full rounded-xl font-semibold disabled:opacity-50 lg:w-80"
          >
            {uploading
              ? t('admin.photos.uploadingProgress', uploading)
              : isSubmitting
                ? t('admin.form.saving')
                : isNew
                  ? t('admin.form.create')
                  : t('admin.form.save')}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title={t('admin.form.unsavedTitle')}
        body={t('admin.form.unsavedBody')}
        confirmLabel={t('admin.form.leave')}
        cancelLabel={t('admin.form.stay')}
        destructive
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
      <ConfirmDialog
        open={confirmDelete}
        title={t('admin.confirm.deleteTitle')}
        body={t('admin.confirm.deleteBody')}
        confirmLabel={t('admin.confirm.delete')}
        destructive
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          setConfirmDelete(false);
          if (!id) return;
          remove.mutate(id, {
            onSuccess: () => {
              toast(t('admin.deleted'));
              leaveTo('/admin');
            },
            onError: (error) => {
              toast(adminErrorMessage(t, error), 'error');
            },
          });
        }}
      />
    </form>
  );
}
