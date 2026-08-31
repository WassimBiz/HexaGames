export interface RoomRepository<T> {
  get(code: string): T | undefined;
  save(code: string, room: T): void;
  delete(code: string): void;
  list(): T[];
}

export class InMemoryRoomRepository<T> implements RoomRepository<T> {
  private readonly rooms = new Map<string, T>();

  get(code: string): T | undefined {
    return this.rooms.get(code);
  }
  save(code: string, room: T): void {
    this.rooms.set(code, room);
  }
  delete(code: string): void {
    this.rooms.delete(code);
  }
  list(): T[] {
    return [...this.rooms.values()];
  }
}
