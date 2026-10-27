import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { RegisterUserDto } from './dto/register-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {

  constructor(
    @InjectRepository(User) private userRepository: Repository<User>,
  ) { }

  async create(registerUserDto: RegisterUserDto): Promise<User> {
    const newUser = this.userRepository.create({
      ...registerUserDto,
      createdAt: new Date(),
    });

    await this.userRepository.save(newUser);

    const createdUser: User = await this.userRepository.findOne({
      where: { id: newUser.id },
    });

    return createdUser;
  }

  async findAll(): Promise<User[]> {
    const users = await this.userRepository.find();
    return Array.isArray(users) ? users : [];
  }

  // Batch lookup for the GraphQL user DataLoader: one query for many ids, and only the columns the API exposes
  // (never the password hash).
  async findPeopleByIds(userIds: readonly string[]): Promise<Pick<User, 'id' | 'firstname' | 'lastname'>[]> {
    return await this.userRepository.find({
      select: { id: true, firstname: true, lastname: true },
      where: { id: In([...userIds]) },
    });
  }

  async findOneById(userId: string): Promise<User> {
    return await this.userRepository.findOne({
      where: { id: userId },
    });
  }

  async findOneByEmail(email: string): Promise<User> {
    return await this.userRepository.findOne({
      where: { email: email.toLocaleLowerCase() }
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    await this.userRepository.update(id, updateUserDto);
    return await this.userRepository.findOne({ where: { id } });
  }

  async markUserAccountAsVerified(user: User) {
    user.emailVerified = true;
    return await this.userRepository.save(user);
  }

  async remove(userId: string): Promise<Boolean> {
    var user: User = await this.userRepository.findOne({ where: { id: userId } });
    await this.userRepository.delete(userId);
    return true;
  }

}
