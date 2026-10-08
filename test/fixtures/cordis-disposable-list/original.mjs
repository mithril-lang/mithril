/** Ordered collection of disposable values with O(1) deletion by value. */
export class DisposableList {
    sn = 0;
    map = new Map();
    weak = new WeakMap();
    get length() {
        return this.map.size;
    }
    push(value) {
        const sn = ++this.sn;
        this.map.set(sn, value);
        this.weak.set(value, sn);
        return () => this.map.delete(sn);
    }
    delete(value) {
        const sn = this.weak.get(value);
        if (!sn)
            return false;
        return this.map.delete(sn);
    }
    clear() {
        const values = [...this.map.values()];
        this.map.clear();
        return values.reverse();
    }
    [Symbol.iterator]() {
        return this.map.values();
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return [...this];
    }
}
