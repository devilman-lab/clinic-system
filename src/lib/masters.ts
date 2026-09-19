import db from './db';

export interface MasterDoctor {
  id: string;
  displayName: string;
  colorToken: string;
  surgeryIds: string[];
}

export interface MasterSurgery {
  id: string;
  displayName: string;
  standardDuration: number;
  requiredSlotDuration: number;
  doctorIds: string[];
}

export interface MasterRoom {
  id: string;
  name: string;
  number: number;
}

export interface Masters {
  doctors: MasterDoctor[];
  surgeries: MasterSurgery[];
  rooms: MasterRoom[];
}

export async function getMasters(): Promise<Masters> {
  const [doctors, surgeries, rooms] = await Promise.all([
    db.doctor.findMany({
      where: { isActive: true },
      include: { surgeryTypes: { select: { id: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    db.surgery.findMany({
      where: { isActive: true },
      include: { doctors: { select: { id: true } } },
      orderBy: { sortOrder: 'asc' },
    }),
    db.operatingRoom.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
  ]);

  return {
    doctors: doctors.map((d) => ({
      id: d.id,
      displayName: d.displayName,
      colorToken: d.colorToken,
      surgeryIds: d.surgeryTypes.map((s) => s.id),
    })),
    surgeries: surgeries.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      standardDuration: s.standardDuration,
      requiredSlotDuration: s.requiredSlotDuration,
      doctorIds: s.doctors.map((d) => d.id),
    })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, number: r.number })),
  };
}
