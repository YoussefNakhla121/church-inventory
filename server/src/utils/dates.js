const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateOnly = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
};

const validatePeriod = (start, end) => {
  const parsedStart = parseDateOnly(start);
  const parsedEnd = parseDateOnly(end);

  if (!parsedStart || !parsedEnd) {
    return 'start and end must be valid dates in YYYY-MM-DD format';
  }

  const startTime = Date.UTC(
    Number(parsedStart.slice(0, 4)),
    Number(parsedStart.slice(5, 7)) - 1,
    Number(parsedStart.slice(8, 10))
  );
  const endTime = Date.UTC(
    Number(parsedEnd.slice(0, 4)),
    Number(parsedEnd.slice(5, 7)) - 1,
    Number(parsedEnd.slice(8, 10))
  );

  if (startTime > endTime) {
    return 'start must be on or before end';
  }

  const spanDays = (endTime - startTime) / (24 * 60 * 60 * 1000);
  if (spanDays > 366) {
    return 'the period cannot exceed 366 days';
  }

  return null;
};

module.exports = { parseDateOnly, validatePeriod };
